// SPDX-License-Identifier: MIT
//
// Drafts: posts and pages that aren't published yet, committed to the site
// repository under `[drafts] dir` (outside Hugo's content, so never built):
//
//   <dir>/posts/<draftId>.md
//   <dir>/pages/<draftId>.md
//
// Paths are built here from a validated type and draft ID (a ULID); the client
// never supplies a path.
//
//   GET  /api/drafts                 list drafts
//   GET  /api/drafts/:type/:id       read one
//   PUT  /api/drafts/:type/:id       save (commit) one, optimistic on the blob SHA
//   POST /api/drafts/:type/:id/publish  publish one (see below)
//   GET  /api/drafts/:type/:id/fate     where a draft went that is no longer in the drafts folder

import { Hono, type Context } from "hono";
import { z } from "zod";
import { isUlid } from "../../shared/ulid";
import type { AlasinConfig } from "../../shared/config/schema";
import type { AppEnv } from "../app";
import { ConflictError, Repo } from "../lib/repo";
import { copyDraftImages, MissingImageError } from "../lib/publish-media";
import { contentPath, draftImageRefs, draftInfo, maintainedFields, parseDay, publishedText } from "../../shared/publish";
import { logError } from "../lib/log";
import { getUserToken } from "../session";

export const DRAFT_TYPES = ["post", "page"] as const;
export type DraftType = (typeof DRAFT_TYPES)[number];

/** Largest draft file accepted, in bytes (Markdown text; images are stored separately). */
export const MAX_DRAFT_BYTES = 1024 * 1024;

export function draftPath(config: AlasinConfig, type: DraftType, id: string): string {
  return `${config.drafts.dir}/${type}s/${id}.md`;
}

async function repoFor(c: Context<AppEnv>): Promise<Repo> {
  const { github } = c.get("config");
  return new Repo(await getUserToken(c), github.owner, github.repo, github.branch);
}

function params(c: Context<AppEnv>): { type: DraftType; id: string } | null {
  const type = c.req.param("type") as DraftType;
  const id = c.req.param("id") ?? "";
  if (!DRAFT_TYPES.includes(type) || !isUlid(id)) return null;
  return { type, id };
}

const saveBody = z.strictObject({
  content: z.string().max(MAX_DRAFT_BYTES),
  /** Blob SHA of the version being replaced; null for a new draft. */
  sha: z.string().regex(/^[0-9a-f]{40}$/).nullable(),
  /** Title for the commit message. */
  title: z.string().max(200).optional(),
});

export const drafts = new Hono<AppEnv>();

drafts.get("/", async (c) => {
  const config = c.get("config");
  const repo = await repoFor(c);
  const list = [];
  for (const type of DRAFT_TYPES) {
    for (const entry of await repo.listDir(`${config.drafts.dir}/${type}s`)) {
      const id = entry.name.replace(/\.md$/, "");
      if (entry.type === "file" && entry.name.endsWith(".md") && isUlid(id)) list.push({ type, id, sha: entry.sha });
    }
  }
  return c.json({ drafts: list });
});

drafts.get("/:type/:id", async (c) => {
  const p = params(c);
  if (!p) return c.json({ error: "not_found", message: "No such draft." }, 404);
  const file = await (await repoFor(c)).getFile(draftPath(c.get("config"), p.type, p.id));
  if (!file) return c.json({ error: "not_found", message: "No such draft." }, 404);
  return c.json({ type: p.type, id: p.id, content: file.content, sha: file.sha });
});

drafts.put("/:type/:id", async (c) => {
  const p = params(c);
  if (!p) return c.json({ error: "not_found", message: "No such draft." }, 404);
  const length = Number(c.req.header("Content-Length") ?? "0");
  if (length > MAX_DRAFT_BYTES * 2) return c.json({ error: "too_large", message: "The draft is too large." }, 413);
  const parsed = saveBody.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) {
    const tooBig = parsed.error.issues.some((i) => i.code === "too_big" && i.path[0] === "content");
    return tooBig
      ? c.json({ error: "too_large", message: "The draft is too large." }, 413)
      : c.json({ error: "invalid", message: "Invalid draft." }, 400);
  }
  const { content, sha, title } = parsed.data;
  if (new TextEncoder().encode(content).length > MAX_DRAFT_BYTES) {
    return c.json({ error: "too_large", message: "The draft is too large." }, 413);
  }
  // A draft file always starts with front matter that names its own draft ID.
  if (!/^(---|\+\+\+)\r?\n/.test(content) || !content.includes(p.id)) {
    return c.json({ error: "invalid", message: "The draft's front matter is missing its draft ID." }, 400);
  }

  const { success } = await c.env.RL_COMMIT.limit({ key: `commit:${c.get("session").uid}` });
  if (!success) return c.json({ error: "rate_limited", message: "Too many saves. Wait a moment and try again." }, 429);

  const path = draftPath(c.get("config"), p.type, p.id);
  const summary = title?.trim() ? `: ${title.trim().replace(/\s+/g, " ")}` : "";
  try {
    const result = await (await repoFor(c)).commit([{ path, content, expectedSha: sha }], `Save draft ${p.type}${summary}`);
    return c.json({ sha: result.shas[path], commit: result.commit });
  } catch (err) {
    if (err instanceof ConflictError) {
      return c.json(
        { error: "conflict", message: "This draft was changed somewhere else since you opened it. Reload it to see the latest version." },
        409,
      );
    }
    throw err;
  }
});

const publishBody = z.strictObject({
  /** Blob SHA of the saved draft being published: unsaved changes are never published. */
  sha: z.string().regex(/^[0-9a-f]{40}$/),
  /** The post's day in the author's time zone (YYYY-MM-DD), for folders named by date. */
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * Publishing, safe to retry after a failure at any step:
 *
 * 1. Copy the draft images the text uses (and their resized variants) to
 *    MEDIA, under names that are free there; nothing is ever overwritten.
 * 2. In one commit, add the published file at its content path (which must
 *    not exist yet) and remove the draft file (which must be unchanged).
 * 3. Only after that commit, delete the draft's images from DRAFTS.
 *
 * If step 1 or 2 fails, the draft is untouched; a retry reuses the copies.
 */
drafts.post("/:type/:id/publish", async (c) => {
  const p = params(c);
  if (!p) return c.json({ error: "not_found", message: "No such draft." }, 404);
  const parsed = publishBody.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) return c.json({ error: "invalid", message: "Invalid request." }, 400);

  const { success } = await c.env.RL_COMMIT.limit({ key: `commit:${c.get("session").uid}` });
  if (!success) return c.json({ error: "rate_limited", message: "Too many saves. Wait a moment and try again." }, 429);

  const config = c.get("config");
  const repo = await repoFor(c);
  const source = draftPath(config, p.type, p.id);
  const file = await repo.getFile(source);
  if (!file) {
    return c.json({ error: "not_found", message: "This draft no longer exists. It may have been published or deleted already." }, 404);
  }
  if (file.sha !== parsed.data.sha) {
    return c.json({ error: "conflict", message: "This draft was changed somewhere else since you opened it. Reload it to see the latest version." }, 409);
  }
  const info = draftInfo(file.content);
  if (!info) return c.json({ error: "invalid", message: "The draft's front matter can't be read." }, 422);
  if (!info.title) return c.json({ error: "no_title", message: "Give the draft a title before publishing." }, 422);
  const day = parseDay(parsed.data.day) ?? parseDay(info.date) ?? parseDay(new Date().toISOString())!;
  const target = contentPath(config, p.type, info.slug, day);

  let urls: Map<string, string>;
  try {
    urls = await copyDraftImages(c.env.DRAFTS, c.env.MEDIA, draftImageRefs(file.content), day, {
      pathPattern: config.media.path_pattern,
      contentPrefix: config.media.content_prefix,
      cacheControl: config.media.cache_control,
    });
  } catch (err) {
    if (err instanceof MissingImageError) {
      return c.json({ error: "missing_image", message: `An image in the text (${err.file}) no longer exists. Remove it and try again.` }, 422);
    }
    throw err;
  }

  const content = publishedText(file.content, urls, maintainedFields(config, p.type, info, day, { url: true }));
  const kind = p.type === "post" ? "post" : "page";
  try {
    const result = await repo.commit(
      [
        { path: target, content, expectedSha: null },
        { path: source, content: null, expectedSha: file.sha },
      ],
      `Publish ${kind}: ${info.title.replace(/\s+/g, " ")}`,
    );
    // The draft's images now live in MEDIA (those it used) or are no longer needed.
    try {
      const listed = await c.env.DRAFTS.list({ prefix: `${p.id}/`, limit: 1000 });
      if (listed.objects.length) await c.env.DRAFTS.delete(listed.objects.map((o) => o.key));
    } catch (err) {
      // Left for the daily orphan cleanup.
      logError({ rid: c.get("requestId"), event: "draft_media_cleanup_failed", uid: c.get("session").uid }, err);
    }
    return c.json({ path: target, commit: result.commit });
  } catch (err) {
    if (err instanceof ConflictError) {
      return err.path === target
        ? c.json({ error: "exists", message: `A ${kind} already exists at ${target}. Change the slug and try again.` }, 409)
        : c.json({ error: "conflict", message: "This draft was changed somewhere else since you opened it. Reload it to see the latest version." }, 409);
    }
    throw err;
  }
});

/**
 * A draft this device saved earlier is gone from the drafts folder: it was
 * published, moved to the Bin or deleted, maybe from another device. The last
 * commit that touched the draft file tells which, and where it went.
 */
drafts.get("/:type/:id/fate", async (c) => {
  const p = params(c);
  if (!p) return c.json({ error: "not_found", message: "No such draft." }, 404);
  const config = c.get("config");
  const repo = await repoFor(c);
  const source = draftPath(config, p.type, p.id);
  if (await repo.getFile(source)) return c.json({ state: "draft" });
  const change = await repo.lastChangeOf(source);
  if (!change) return c.json({ state: "unknown" });
  const moved = change.files.find((f) => f.previous_filename === source);
  if (moved?.filename.startsWith(`${config.bin.dir}/`)) return c.json({ state: "bin", path: moved.filename });
  const dir = p.type === "post" ? config.site.posts_dir : config.site.pages_dir;
  const published = moved?.filename.startsWith(`${dir}/`)
    ? moved.filename
    : change.files.find((f) => f.status === "added" && f.filename.startsWith(`${dir}/`) && f.filename.endsWith(".md"))?.filename;
  if (published) {
    const exists = (await repo.getFile(published)) !== null;
    return c.json({ state: "published", path: published, exists });
  }
  return c.json({ state: "deleted" });
});

