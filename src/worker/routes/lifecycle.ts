// SPDX-License-Identifier: MIT
//
// Moving a post or page between its states (spec: publish, archive, delete
// and the Bin). Each change is one commit that moves the file between the
// configured folders; the file must be unchanged since it was read, and the
// destination must not exist. Refused while someone else holds the edit lock.
//
//   POST /api/lifecycle {action, path, sha, lockId?, day?}
//
//   unpublish  published → draft    <posts|pages>/… → <drafts>/<type>s/<new draftId>.md, draft: true
//   archive    published → archived <path> → <archive>/<path>
//   republish  archived → published <archive>/<path> → <path>, lastmod set
//   publish    a post or page marked draft: true in the content folders → draft: false
//              in place, lastmod and url set (drafts saved by Alasin use POST /api/drafts/…/publish)

import { type Context, Hono } from "hono";
import { z } from "zod";
import type { AlasinConfig } from "../../shared/config/schema";
import { splitFrontMatter, parseFields } from "../../shared/frontmatter";
import { draftInfo, maintainedFields, parseDay, withFields } from "../../shared/publish";
import { ulid } from "../../shared/ulid";
import type { AppEnv } from "../app";
import { ConflictError, Repo } from "../lib/repo";
import { getUserToken } from "../session";
import { draftPath } from "./drafts";

const ACTIONS = ["unpublish", "archive", "republish", "publish"] as const;
type Action = (typeof ACTIONS)[number];

const body = z.strictObject({
  action: z.enum(ACTIONS),
  path: z.string().max(512),
  sha: z.string().regex(/^[0-9a-f]{40}$/),
  /** The caller's own edit lock, if it holds one. */
  lockId: z.string().max(64).optional(),
  /** The post's day in the author's time zone (YYYY-MM-DD), for the url. */
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const safe = (path: string) => path.endsWith(".md") && !path.startsWith("/") && !path.split("/").some((s) => s === ".." || s === "." || s === "");

/** The kind of a published path, or null. */
function publishedKind(config: AlasinConfig, path: string): "post" | "page" | null {
  if (!safe(path)) return null;
  if (path.startsWith(`${config.site.posts_dir}/`)) return "post";
  if (path.startsWith(`${config.site.pages_dir}/`)) return "page";
  return null;
}

/** The published path an archived path came from, or null. */
function archivedOrigin(config: AlasinConfig, path: string): string | null {
  if (!safe(path) || !path.startsWith(`${config.archive.dir}/`)) return null;
  const origin = path.slice(config.archive.dir.length + 1);
  return publishedKind(config, origin) ? origin : null;
}

const MESSAGES: Record<Action, string> = { unpublish: "Unpublish", archive: "Archive", republish: "Republish", publish: "Publish" };

export const lifecycle = new Hono<AppEnv>();

lifecycle.post("/", async (c: Context<AppEnv>) => {
  const parsed = body.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) return c.json({ error: "invalid", message: "Invalid request." }, 400);
  const { action, path, sha, lockId } = parsed.data;
  const config = c.get("config");

  // What the path is, and where it goes.
  const origin = action === "republish" ? archivedOrigin(config, path) : path;
  const kind = origin ? publishedKind(config, origin) : null;
  if (!origin || !kind) return c.json({ error: "invalid", message: "This can't be done to that file." }, 400);

  // Someone else is editing it.
  const holder = await c.env.LOCKS.get(c.env.LOCKS.idFromName("locks")).holderOf(`file:${origin}`);
  if (holder && holder.lockId !== lockId) {
    return c.json({ error: "locked", message: `${holder.name ?? holder.login} is editing this. Try again when they're done.`, holder }, 409);
  }

  const { success } = await c.env.RL_COMMIT.limit({ key: `commit:${c.get("session").uid}` });
  if (!success) return c.json({ error: "rate_limited", message: "Too many saves. Wait a moment and try again." }, 429);

  const { github } = config;
  const repo = new Repo(await getUserToken(c), github.owner, github.repo, github.branch);
  const file = await repo.getFile(path);
  if (!file) return c.json({ error: "not_found", message: "This file no longer exists." }, 404);
  if (file.sha !== sha) return c.json({ error: "conflict", message: "This was changed somewhere else. Reload it to see the latest version." }, 409);
  const info = draftInfo(file.content);
  if (!info) return c.json({ error: "invalid", message: "The front matter can't be read." }, 422);
  const day = parseDay(parsed.data.day) ?? parseDay(info.date) ?? parseDay(new Date().toISOString())!;
  const split = splitFrontMatter(file.content)!;
  const isDraft = parseFields(split.format, split.raw).get("draft") === true;

  let target: string;
  let content: string;
  let draftId: string | undefined;
  switch (action) {
    case "unpublish":
      draftId = ulid();
      target = draftPath(config, kind, draftId);
      content = withFields(file.content, [["draft", true], ["draftId", draftId]]);
      break;
    case "archive":
      target = `${config.archive.dir}/${path}`;
      content = file.content;
      break;
    case "republish":
      target = origin;
      content = withFields(file.content, maintainedFields(config, kind, info, day, { url: false }));
      break;
    case "publish":
      if (!isDraft) return c.json({ error: "invalid", message: "This is already published." }, 400);
      if (!info.title) return c.json({ error: "no_title", message: "Give it a title before publishing." }, 422);
      target = path;
      content = withFields(file.content, [["draft", false], ...maintainedFields(config, kind, info, day, { url: true })]);
      break;
  }

  try {
    const result = await repo.commit(
      target === path
        ? [{ path, content, expectedSha: sha }]
        : [
            { path: target, content, expectedSha: null },
            { path, content: null, expectedSha: sha },
          ],
      `${MESSAGES[action]} ${kind}: ${(info.title || path).replace(/\s+/g, " ")}`,
    );
    return c.json({ path: target, sha: result.shas[target], commit: result.commit, ...(draftId ? { type: kind, draftId } : {}) });
  } catch (err) {
    if (err instanceof ConflictError) {
      return err.path === target && target !== path
        ? c.json({ error: "exists", message: `Something already exists at ${target}.` }, 409)
        : c.json({ error: "conflict", message: "This was changed somewhere else. Reload it to see the latest version." }, 409);
    }
    throw err;
  }
});
