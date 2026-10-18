// SPDX-License-Identifier: MIT
//
// The Bin for published images. Deleting an image (an orphaned one, picked in
// *Media*) moves it and its size variants out of the public MEDIA bucket into
// the private DRAFTS bucket under `media-bin/<its key>`, so it's off the site
// but can be recovered to exactly that key. Only "Delete permanently" and
// "Empty Bin" remove images for good, and only there. Recovering never
// overwrites: if something new is at the key, it stays in the Bin.
//
//   GET  /api/media-bin              the images in the Bin (variants grouped), with who deleted them when
//   GET  /api/media-bin/file?key=    an image or variant in the Bin, to logged-in users only, never cached
//   POST /api/media-bin/delete  {keys}  → {deleted}  (MEDIA keys of main images, at most 20)
//   POST /api/media-bin/recover {key}   → {key}
//   POST /api/media-bin/purge   {keys}  → {removed}  (at most 100)

import { type Context, Hono } from "hono";
import { z } from "zod";
import type { AlasinConfig } from "../../shared/config/schema";
import { groupImages } from "../../shared/media-library";
import type { AppEnv } from "../app";
import { IMAGE, inside, safe } from "./library";

/** Where deleted images are kept in DRAFTS. Not a draft ID, so the nightly cleanup leaves it alone. */
export const MEDIA_BIN = "media-bin/";

/** Custom metadata on a binned main image (removed again when it's recovered). */
const DELETED_BY = "alasinDeletedBy";
const DELETED_AT = "alasinDeletedAt";

const stemOf = (key: string) => key.replace(/\.[A-Za-z0-9]+$/, "");
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const imageKey = (config: AlasinConfig, key: string) => safe(key) && IMAGE.test(key) && inside(config, key);

/** The image and its variants (`<stem>-<width>.<ext>`) among the objects under `prefix`. */
async function withVariants(bucket: R2Bucket, prefix: string, key: string): Promise<string[]> {
  const variant = new RegExp(`^${escape(prefix + stemOf(key))}-\\d{2,5}\\.[A-Za-z0-9]+$`);
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: prefix + stemOf(key), limit: 1000, ...(cursor ? { cursor } : {}) });
    keys.push(...page.objects.map((o) => o.key).filter((k) => k === prefix + key || variant.test(k)));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
}

async function copy(from: R2Bucket, fromKey: string, to: R2Bucket, toKey: string, metadata: (m: Record<string, string>) => Record<string, string>): Promise<void> {
  const object = await from.get(fromKey);
  if (!object) throw new Error(`${fromKey} vanished while being moved`);
  await to.put(toKey, await object.arrayBuffer(), { httpMetadata: object.httpMetadata, customMetadata: metadata(object.customMetadata ?? {}) });
}

async function limited(c: Context<AppEnv>): Promise<boolean> {
  const { success } = await c.env.RL_COMMIT.limit({ key: `commit:${c.get("session").uid}` });
  return !success;
}

export const mediaBin = new Hono<AppEnv>();

mediaBin.get("/", async (c) => {
  const keys: string[] = [];
  const deleted = new Map<string, { by: string; at: string }>();
  let cursor: string | undefined;
  do {
    const page = await c.env.DRAFTS.list({ prefix: MEDIA_BIN, limit: 1000, include: ["customMetadata"], ...(cursor ? { cursor } : {}) });
    for (const o of page.objects) {
      const key = o.key.slice(MEDIA_BIN.length);
      if (!IMAGE.test(key)) continue;
      keys.push(key);
      const m = o.customMetadata ?? {};
      if (m[DELETED_AT]) deleted.set(key, { by: m[DELETED_BY] ?? "", at: m[DELETED_AT] });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  const images = groupImages(keys).map((img) => ({ ...img, deletedBy: deleted.get(img.key)?.by ?? "", deletedAt: deleted.get(img.key)?.at ?? "" }));
  return c.json({ images });
});

mediaBin.get("/file", async (c) => {
  const key = c.req.query("key") ?? "";
  if (!safe(key) || !IMAGE.test(key)) return c.json({ error: "not_found", message: "No such image." }, 404);
  const object = await c.env.DRAFTS.get(MEDIA_BIN + key);
  if (!object) return c.json({ error: "not_found", message: "No such image." }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Content-Length": String(object.size),
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

mediaBin.post("/delete", async (c) => {
  const parsed = z.strictObject({ keys: z.array(z.string()).min(1).max(20) }).safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) return c.json({ error: "invalid", message: "Invalid request." }, 400);
  const config = c.get("config");
  const keys = [...new Set(parsed.data.keys)];
  if (keys.some((k) => !imageKey(config, k))) return c.json({ error: "invalid", message: "Only images in the media library can be deleted." }, 400);
  if (await limited(c)) return c.json({ error: "rate_limited", message: "Too many saves. Wait a moment and try again." }, 429);

  // Everything is checked before anything moves.
  const moves: { key: string; objects: string[] }[] = [];
  for (const key of keys) {
    const objects = await withVariants(c.env.MEDIA, "", key);
    if (!objects.includes(key)) return c.json({ error: "not_found", message: `${key} is no longer in the media bucket.`, key }, 404);
    if ((await withVariants(c.env.DRAFTS, MEDIA_BIN, key)).length) {
      return c.json({ error: "exists", message: `An earlier copy of ${key} is already in the Bin. Delete that one permanently or recover it first.`, key }, 409);
    }
    moves.push({ key, objects });
  }

  const session = c.get("session");
  const at = new Date().toISOString();
  for (const { key, objects } of moves) {
    // Into the Bin first, so a failure never loses an image; then out of MEDIA.
    for (const o of objects) {
      await copy(c.env.MEDIA, o, c.env.DRAFTS, MEDIA_BIN + o, (m) => (o === key ? { ...m, [DELETED_BY]: session.name || session.login, [DELETED_AT]: at } : m));
    }
    await c.env.MEDIA.delete(objects);
  }
  return c.json({ deleted: keys });
});

mediaBin.post("/recover", async (c) => {
  const parsed = z.strictObject({ key: z.string() }).safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) return c.json({ error: "invalid", message: "Invalid request." }, 400);
  const config = c.get("config");
  const { key } = parsed.data;
  if (!imageKey(config, key)) return c.json({ error: "invalid", message: "This isn't in the Bin." }, 400);
  if (await limited(c)) return c.json({ error: "rate_limited", message: "Too many saves. Wait a moment and try again." }, 429);

  const objects = await withVariants(c.env.DRAFTS, MEDIA_BIN, key);
  if (!objects.includes(MEDIA_BIN + key)) return c.json({ error: "not_found", message: "This is no longer in the Bin." }, 404);
  // MEDIA is never overwritten: anything new at the image's key or one of its variants' keeps it in the Bin.
  for (const o of objects) {
    if (await c.env.MEDIA.head(o.slice(MEDIA_BIN.length))) return c.json({ error: "exists", message: `Something new is at ${key} now.`, key }, 409);
  }
  const strip = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== DELETED_BY && k !== DELETED_AT));
  for (const o of objects) await copy(c.env.DRAFTS, o, c.env.MEDIA, o.slice(MEDIA_BIN.length), strip);
  await c.env.DRAFTS.delete(objects);
  return c.json({ key });
});

mediaBin.post("/purge", async (c) => {
  const parsed = z.strictObject({ keys: z.array(z.string()).min(1).max(100) }).safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) return c.json({ error: "invalid", message: "Invalid request." }, 400);
  const config = c.get("config");
  const keys = [...new Set(parsed.data.keys)];
  if (keys.some((k) => !imageKey(config, k))) return c.json({ error: "invalid", message: "Only images in the Bin can be deleted permanently." }, 400);
  if (await limited(c)) return c.json({ error: "rate_limited", message: "Too many saves. Wait a moment and try again." }, 429);

  // Only inside the Bin: every key here starts with MEDIA_BIN.
  let removed = 0;
  for (const key of keys) {
    const objects = await withVariants(c.env.DRAFTS, MEDIA_BIN, key);
    if (!objects.length) continue;
    await c.env.DRAFTS.delete(objects);
    removed++;
  }
  return c.json({ removed });
});
