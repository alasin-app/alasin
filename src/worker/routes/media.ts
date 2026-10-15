// SPDX-License-Identifier: MIT
//
// Images of unpublished drafts, in the private DRAFTS bucket under
// `<draftId>/<file>`. Keys are built here from a validated draft ID (ULID) and
// a file name in Alasin's own format; nothing outside a draft's prefix can be
// read or written, and the public MEDIA bucket is never touched.
//
//   POST /api/draft-media/:id/names   {name}  → a free base name for an uploaded file
//   PUT  /api/draft-media/:id/:file   image bytes (main image or a resized variant)
//   GET  /api/draft-media/:id         the draft's images (main images with their smallest variant)
//   GET  /api/draft-media/:id/:file   the image, to logged-in users only, never cached

import { Hono } from "hono";
import { z } from "zod";
import { baseNameFromUpload, uniqueBaseName } from "../../shared/image-names";
import { hasGpsLocation, sniffImageType, type ImageType } from "../../shared/image-files";
import { isUlid } from "../../shared/ulid";
import type { AppEnv } from "../app";

const EXTENSIONS: Record<ImageType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

/** `<base>.<ext>` or `<base>-<width>.<ext>`, with a base as produced by baseNameFromUpload. */
const FILE = /^([a-z0-9][a-z0-9_-]{0,79}?)(?:-(\d{2,5}))?\.(jpg|png|webp|gif)$/;

export const media = new Hono<AppEnv>();

function draftId(id: string | undefined): string | null {
  return id && isUlid(id) ? id : null;
}

media.post("/:id/names", async (c) => {
  const id = draftId(c.req.param("id"));
  if (!id) return c.json({ error: "not_found", message: "No such draft." }, 404);
  const body = z.strictObject({ name: z.string().max(255) }).safeParse(await c.req.json().catch(() => undefined));
  if (!body.success) return c.json({ error: "invalid", message: "Invalid file name." }, 400);
  const listed = await c.env.DRAFTS.list({ prefix: `${id}/`, limit: 1000 });
  // A name like "photo-2024" could also be read as "photo" at width 2024: both count as taken.
  const taken = new Set<string>();
  for (const o of listed.objects) {
    const stem = o.key.slice(id.length + 1).replace(/\.[a-z]+$/, "");
    taken.add(stem);
    taken.add(stem.replace(/-\d{2,5}$/, ""));
  }
  const base = await uniqueBaseName(baseNameFromUpload(body.data.name), async (candidate) => taken.has(candidate));
  return c.json({ base });
});

media.get("/:id", async (c) => {
  const id = draftId(c.req.param("id"));
  if (!id) return c.json({ error: "not_found", message: "No such draft." }, 404);
  const listed = await c.env.DRAFTS.list({ prefix: `${id}/`, limit: 1000 });
  const files = listed.objects.map((o) => o.key.slice(id.length + 1)).filter((f) => FILE.test(f));
  const stems = new Set(files.map((f) => f.replace(/\.[a-z]+$/, "")));
  // "<stem>-<width>" is a variant only if "<stem>" itself exists.
  const variantOf = (f: string) => {
    const m = /^(.*)-(\d{2,5})\.[a-z]+$/.exec(f);
    return m && stems.has(m[1]!) ? { stem: m[1]!, width: Number(m[2]) } : null;
  };
  const images = files
    .filter((f) => !variantOf(f))
    .map((file) => {
      const stem = file.replace(/\.[a-z]+$/, "");
      const variants = files
        .map((f) => ({ f, v: variantOf(f) }))
        .filter((x) => x.v?.stem === stem)
        .sort((a, b) => a.v!.width - b.v!.width);
      const url = (f: string) => `/api/draft-media/${id}/${f}`;
      return { file, url: url(file), thumb: url(variants[0]?.f ?? file) };
    });
  return c.json({ images });
});

media.put("/:id/:file", async (c) => {
  const id = draftId(c.req.param("id"));
  const file = c.req.param("file");
  const match = FILE.exec(file);
  if (!id || !match) return c.json({ error: "invalid", message: "Invalid draft or file name." }, 400);

  const config = c.get("config");
  const max = config.images.max_upload_mb * 1024 * 1024;
  const declared = Number(c.req.header("Content-Length") ?? "0");
  if (declared > max) return c.json({ error: "too_large", message: `Images can be at most ${config.images.max_upload_mb} MB.` }, 413);

  const { success } = await c.env.RL_UPLOAD.limit({ key: `upload:${c.get("session").uid}` });
  if (!success) return c.json({ error: "rate_limited", message: "Too many uploads. Wait a moment and try again." }, 429);

  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.length === 0) return c.json({ error: "invalid", message: "The file is empty." }, 400);
  if (bytes.length > max) return c.json({ error: "too_large", message: `Images can be at most ${config.images.max_upload_mb} MB.` }, 413);

  // The content decides the type: the declared Content-Type and the name must agree with it.
  const actual = sniffImageType(bytes);
  if (!actual || !config.images.accepted_types.includes(actual)) {
    return c.json({ error: "unsupported_type", message: "This file type isn't accepted. Use JPEG, PNG, WebP or GIF." }, 415);
  }
  const declaredType = (c.req.header("Content-Type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (declaredType !== actual || EXTENSIONS[actual] !== match[3]) {
    return c.json({ error: "type_mismatch", message: "The file's contents don't match its type." }, 415);
  }
  if (hasGpsLocation(bytes, actual)) {
    return c.json({ error: "gps", message: "The image still contains its GPS location. It must be removed before upload." }, 422);
  }

  await c.env.DRAFTS.put(`${id}/${file}`, bytes, {
    httpMetadata: { contentType: actual },
    customMetadata: { uploadedBy: String(c.get("session").uid) },
  });
  return c.json({ key: `${id}/${file}`, url: `/api/draft-media/${id}/${file}`, size: bytes.length });
});

media.get("/:id/:file", async (c) => {
  const id = draftId(c.req.param("id"));
  const file = c.req.param("file");
  if (!id || !FILE.test(file)) return c.json({ error: "not_found", message: "No such image." }, 404);
  const object = await c.env.DRAFTS.get(`${id}/${file}`);
  if (!object) return c.json({ error: "not_found", message: "No such image." }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Content-Length": String(object.size),
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
    },
  });
});
