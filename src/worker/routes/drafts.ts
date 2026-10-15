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

import { Hono, type Context } from "hono";
import { z } from "zod";
import { isUlid } from "../../shared/ulid";
import type { AlasinConfig } from "../../shared/config/schema";
import type { AppEnv } from "../app";
import { ConflictError, Repo } from "../lib/repo";
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
