// SPDX-License-Identifier: MIT
//
// The Bin (spec §4): deleting moves a post, page or draft into `[bin] dir`
// under the path it was deleted from, so it can be recovered to exactly that
// place. Only "Delete permanently" and "Empty Bin" remove files from the
// repository, and only inside the Bin. A deleted draft's photos stay in DRAFTS
// until then; images already in MEDIA stay there (deleting those is
// media-bin.ts).
//
//   POST /api/bin/delete  {path, sha, lockId?}   → {path}  (its place in the Bin)
//   POST /api/bin/recover {path, sha, rename?}   → {path}  (where it went back to)
//   POST /api/bin/purge   {items: [{path, sha}]} → {removed}

import { type Context, Hono } from "hono";
import { z } from "zod";
import type { AlasinConfig } from "../../shared/config/schema";
import { draftInfo } from "../../shared/publish";
import { isUlid } from "../../shared/ulid";
import type { AppEnv } from "../app";
import { lockedBy } from "../lib/lock-check";
import { logError } from "../lib/log";
import { ConflictError, Repo } from "../lib/repo";
import { getUserToken } from "../session";

const SHA = z.string().regex(/^[0-9a-f]{40}$/);

const safe = (path: string) => path.length <= 512 && path.endsWith(".md") && !path.startsWith("/") && !path.split("/").some((s) => s === ".." || s === "." || s === "");

/** What a repository path is, outside the Bin: what can be deleted and recovered to. */
function kindOf(config: AlasinConfig, path: string): { kind: "post" | "page"; lockKey: string; draftId?: string } | null {
  if (!safe(path)) return null;
  for (const [type, dir] of [
    ["post", config.site.posts_dir],
    ["page", config.site.pages_dir],
  ] as const) {
    if (path.startsWith(`${dir}/`)) return { kind: type, lockKey: `file:${path}` };
    if (path.startsWith(`${config.archive.dir}/${dir}/`)) return { kind: type, lockKey: `file:${path}` };
    const draft = new RegExp(`^${config.drafts.dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/${type}s/([0-9A-Z]{26})\\.md$`).exec(path);
    if (draft && isUlid(draft[1]!)) return { kind: type, lockKey: `draft:${draft[1]}`, draftId: draft[1] };
  }
  return null;
}

/** The path a Bin path was deleted from, if it's one Alasin handles. */
function originOf(config: AlasinConfig, path: string): string | null {
  if (!safe(path) || !path.startsWith(`${config.bin.dir}/`)) return null;
  const origin = path.slice(config.bin.dir.length + 1);
  return kindOf(config, origin) ? origin : null;
}

async function repoFor(c: Context<AppEnv>): Promise<Repo> {
  const { github } = c.get("config");
  return new Repo(await getUserToken(c), github.owner, github.repo, github.branch);
}

async function limited(c: Context<AppEnv>): Promise<boolean> {
  const { success } = await c.env.RL_COMMIT.limit({ key: `commit:${c.get("session").uid}` });
  return !success;
}

const titleOf = (text: string, path: string) => (draftInfo(text)?.title || path.split("/").pop()!).replace(/\s+/g, " ");

export const bin = new Hono<AppEnv>();

bin.post("/delete", async (c) => {
  const parsed = z.strictObject({ path: z.string(), sha: SHA, lockId: z.string().max(64).optional() }).safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) return c.json({ error: "invalid", message: "Invalid request." }, 400);
  const config = c.get("config");
  const { path, sha, lockId } = parsed.data;
  const what = kindOf(config, path);
  if (!what) return c.json({ error: "invalid", message: "This can't be deleted." }, 400);

  const locked = await lockedBy(c, what.lockKey, lockId);
  if (locked) return locked;
  if (await limited(c)) return c.json({ error: "rate_limited", message: "Too many saves. Wait a moment and try again." }, 429);

  const repo = await repoFor(c);
  const file = await repo.getFile(path);
  if (!file) return c.json({ error: "not_found", message: "This file no longer exists." }, 404);
  const target = `${config.bin.dir}/${path}`;
  try {
    await repo.commit(
      [
        { path: target, content: file.content, expectedSha: null },
        { path, content: null, expectedSha: sha },
      ],
      `Delete ${what.kind}: ${titleOf(file.content, path)}`,
    );
    return c.json({ path: target });
  } catch (err) {
    if (err instanceof ConflictError) {
      return err.path === target
        ? c.json({ error: "exists", message: "An earlier copy of this is already in the Bin. Delete that one permanently or recover it first." }, 409)
        : c.json({ error: "conflict", message: "This was changed somewhere else. Reload it to see the latest version." }, 409);
    }
    throw err;
  }
});

/** `content/posts/trip.md` → `content/posts/trip-2.md` (bundles: the folder gets the number). */
function numbered(path: string, n: number): string {
  if (path.endsWith("/index.md")) {
    const dir = path.slice(0, -"/index.md".length);
    return `${dir}-${n}/index.md`;
  }
  return path.replace(/\.md$/, `-${n}.md`);
}

bin.post("/recover", async (c) => {
  const parsed = z.strictObject({ path: z.string(), sha: SHA, rename: z.boolean().optional() }).safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) return c.json({ error: "invalid", message: "Invalid request." }, 400);
  const config = c.get("config");
  const { path, sha, rename } = parsed.data;
  const origin = originOf(config, path);
  if (!origin) return c.json({ error: "invalid", message: "This isn't in the Bin." }, 400);
  if (await limited(c)) return c.json({ error: "rate_limited", message: "Too many saves. Wait a moment and try again." }, 429);

  const repo = await repoFor(c);
  const file = await repo.getFile(path);
  if (!file) return c.json({ error: "not_found", message: "This is no longer in the Bin." }, 404);

  // Something new at the old place: never overwritten; recovered under a new name if asked.
  let target = origin;
  if (await repo.getFile(origin)) {
    if (!rename) return c.json({ error: "exists", message: `Something new is at ${origin} now.`, path: origin }, 409);
    for (let n = 2; ; n++) {
      if (n > 100) return c.json({ error: "exists", message: "No free name found." }, 409);
      target = numbered(origin, n);
      if (!(await repo.getFile(target))) break;
    }
  }
  try {
    await repo.commit(
      [
        { path: target, content: file.content, expectedSha: null },
        { path, content: null, expectedSha: sha },
      ],
      `Recover ${kindOf(config, origin)!.kind}: ${titleOf(file.content, origin)}`,
    );
    return c.json({ path: target, ...(kindOf(config, target)?.draftId ? { draftId: kindOf(config, target)!.draftId } : {}) });
  } catch (err) {
    if (err instanceof ConflictError) {
      return c.json({ error: "conflict", message: "The Bin changed meanwhile. Reload and try again." }, 409);
    }
    throw err;
  }
});

bin.post("/purge", async (c) => {
  const parsed = z.strictObject({ items: z.array(z.strictObject({ path: z.string(), sha: SHA })).min(1).max(100) }).safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) return c.json({ error: "invalid", message: "Invalid request." }, 400);
  const config = c.get("config");
  // Files are deleted only inside the Bin.
  const origins = parsed.data.items.map((i) => originOf(config, i.path));
  if (origins.some((o) => !o)) return c.json({ error: "invalid", message: "Only items in the Bin can be deleted permanently." }, 400);
  if (await limited(c)) return c.json({ error: "rate_limited", message: "Too many saves. Wait a moment and try again." }, 429);

  const n = parsed.data.items.length;
  try {
    await (await repoFor(c)).commit(
      parsed.data.items.map((i) => ({ path: i.path, content: null, expectedSha: i.sha })),
      n === 1 ? `Delete permanently: ${parsed.data.items[0]!.path.slice(config.bin.dir.length + 1)}` : `Empty the Bin (${n} items)`,
    );
  } catch (err) {
    if (err instanceof ConflictError) {
      return c.json({ error: "conflict", message: "The Bin changed meanwhile. Reload and try again." }, 409);
    }
    throw err;
  }
  // Only now: the photos of deleted drafts (never anything in MEDIA).
  for (const origin of origins) {
    const draftId = kindOf(config, origin!)?.draftId;
    if (!draftId) continue;
    try {
      const listed = await c.env.DRAFTS.list({ prefix: `${draftId}/`, limit: 1000 });
      if (listed.objects.length) await c.env.DRAFTS.delete(listed.objects.map((o) => o.key));
    } catch (err) {
      logError({ rid: c.get("requestId"), event: "draft_media_cleanup_failed", uid: c.get("session").uid }, err);
    }
  }
  return c.json({ removed: n });
});
