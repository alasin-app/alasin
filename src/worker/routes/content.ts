// SPDX-License-Identifier: MIT
//
// The site's posts and pages for the lists and the search, read in one
// GitHub GraphQL request: the content folder (holding the posts and pages
// folders, read whole for which images are used), the drafts, archive and Bin folders,
// every Markdown file's text and blob SHA, and the branch's head commit (so
// the browser can keep its index until the repository changes).
//
// The Worker forwards GitHub's response without parsing it: building the list
// and the search index happens in the browser, which keeps the Worker well
// inside the Free plan's CPU time even for large sites. Only these folders are
// read, so images or other large files elsewhere in the repository don't
// matter.
//
//   GET  /api/content                the folders (see contentQuery for the shape)
//   GET  /api/content/head           {commit}: the branch's head, to check a cached index
//   GET  /api/content/changes?base=  files changed since a commit (GitHub's compare, unparsed)
//   POST /api/content/files {paths}  the text of some files (GraphQL, unparsed), up to 100
//   POST /api/content/history {paths}  each file's last commit: who and when (GraphQL, unparsed), up to 50
//   GET  /api/content/file?path=     one published post or page {content, sha}
//   GET  /api/content/asset?path=    an image of a page bundle, to show in the editor (never changed)
//   PUT  /api/content/file           save one (see below)
//
// With the last two, a cached index is brought up to date by reading only
// what changed, instead of every file again.

import { type Context, Hono } from "hono";
import { z } from "zod";
import type { AlasinConfig } from "../../shared/config/schema";
import type { AppEnv } from "../app";
import { GitHubError } from "../lib/github";
import { copyDraftImages, MissingImageError } from "../lib/publish-media";
import { ConflictError, Repo } from "../lib/repo";
import { contentPath, draftImageRefs, draftInfo, maintainedFields, parseDay, replaceImageUrls, withFields } from "../../shared/publish";
import { isUlid } from "../../shared/ulid";
import { contentRoot } from "../../shared/content-root";
import { bundleImageType, isPlainPath } from "../../shared/bundle-files";
import { lockedBy } from "../lib/lock-check";
import { logError } from "../lib/log";
import { getUserToken } from "../session";

/** Folder levels read below each folder, e.g. bin/content/posts/2026/<slug>/index.md. */
const DEPTH = 6;

function treeFields(depth: number): string {
  const blob = "... on Blob { oid text isBinary isTruncated }";
  if (depth === 0) return `entries { name type object { ${blob} } }`;
  return `entries { name type object { ${blob} ... on Tree { ${treeFields(depth - 1)} } } }`;
}

/** The folders Alasin reads: the content folder (with posts and pages in it) or, if they have none in common, those two. */
export function contentDirs(config: AlasinConfig): Partial<Record<"content" | "posts" | "pages" | "drafts" | "archive" | "bin", string>> {
  const { site, drafts, archive, bin } = config;
  const root = contentRoot(site.posts_dir, site.pages_dir);
  return { ...(root ? { content: root } : { posts: site.posts_dir, pages: site.pages_dir }), drafts: drafts.dir, archive: archive.dir, bin: bin.dir };
}

/** The GraphQL query and its variables: one aliased tree per folder. */
export function contentQuery(config: AlasinConfig): { query: string; variables: Record<string, string> } {
  const { github } = config;
  const dirs = Object.entries(contentDirs(config));
  const variables: Record<string, string> = { owner: github.owner, name: github.repo, ref: `refs/heads/${github.branch}` };
  for (const [f, dir] of dirs) variables[f] = `${github.branch}:${dir}`;
  // The content folder is a level above the posts folder: one level more, so posts are read as deep as before.
  const tree = (f: string) => treeFields(f === "content" ? DEPTH : DEPTH - 1);
  const query = `query(${["$owner", "$name", "$ref", ...dirs.map(([f]) => `$${f}`)].map((v) => `${v}: String!`).join(", ")}) {
  repository(owner: $owner, name: $name) {
    ref(qualifiedName: $ref) { target { oid } }
${dirs.map(([f]) => `    ${f}: object(expression: $${f}) { ... on Tree { ${tree(f)} } }`).join("\n")}
  }
}`;
  return { query, variables };
}

async function graphql(token: string, body: unknown): Promise<Response> {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "Alasin" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new GitHubError(`GraphQL returned ${res.status}`, res.status);
  return res;
}

/** GitHub's response as it is: the browser reads it. */
const forward = (res: Response) =>
  new Response(res.body, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" } });

export const content = new Hono<AppEnv>();

content.get("/", async (c) => {
  const res = await graphql(await getUserToken(c), contentQuery(c.get("config")));
  return forward(res);
});

content.get("/head", async (c) => {
  const { github } = c.get("config");
  const res = await graphql(await getUserToken(c), {
    query: "query($owner: String!, $name: String!, $ref: String!) { repository(owner: $owner, name: $name) { ref(qualifiedName: $ref) { target { oid } } } }",
    variables: { owner: github.owner, name: github.repo, ref: `refs/heads/${github.branch}` },
  });
  const data = (await res.json()) as { data?: { repository?: { ref?: { target?: { oid?: string } } | null } | null } };
  const commit = data.data?.repository?.ref?.target?.oid;
  if (!commit) throw new GitHubError(`branch ${github.branch} not found`, 404);
  return c.json({ commit });
});

const SHA = /^[0-9a-f]{40}$/;

content.get("/changes", async (c) => {
  const base = c.req.query("base") ?? "";
  if (!SHA.test(base)) return c.json({ error: "invalid", message: "Invalid commit." }, 400);
  const { github } = c.get("config");
  const res = await fetch(
    `https://api.github.com/repos/${github.owner}/${github.repo}/compare/${base}...${encodeURIComponent(github.branch)}?per_page=1`,
    {
      headers: {
        Authorization: `Bearer ${await getUserToken(c)}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Alasin",
      },
    },
  );
  // 404: the commit is gone (e.g. history rewritten); the browser reads everything again.
  if (res.status === 404) return c.json({ error: "not_found", message: "Unknown commit." }, 404);
  if (!res.ok) throw new GitHubError(`compare returned ${res.status}`, res.status);
  return forward(res);
});

const pathsBody = (max: number) =>
  z.strictObject({
    paths: z
      .array(z.string().min(1).max(512).refine((p) => !p.startsWith("/") && !p.split("/").includes("..")))
      .min(1)
      .max(max),
  });

/** The paths of the request body, if valid and all inside the folders Alasin reads. */
async function contentPaths(c: Context<AppEnv>, max: number): Promise<string[] | null> {
  const parsed = pathsBody(max).safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) return null;
  const dirs = Object.values(contentDirs(c.get("config")));
  return parsed.data.paths.every((p) => dirs.some((d) => p.startsWith(`${d}/`))) ? parsed.data.paths : null;
}

content.post("/files", async (c) => {
  const paths = await contentPaths(c, 100);
  if (!paths) return c.json({ error: "invalid", message: "Invalid request." }, 400);
  const { github } = c.get("config");
  const variables: Record<string, string> = { owner: github.owner, name: github.repo, ref: `refs/heads/${github.branch}` };
  paths.forEach((p, i) => (variables[`p${i}`] = `${github.branch}:${p}`));
  const query = `query($owner: String!, $name: String!, $ref: String!, ${paths.map((_, i) => `$p${i}: String!`).join(", ")}) {
  repository(owner: $owner, name: $name) {
    ref(qualifiedName: $ref) { target { oid } }
${paths.map((_, i) => `    p${i}: object(expression: $p${i}) { ... on Blob { oid text isBinary isTruncated } }`).join("\n")}
  }
}`;
  return forward(await graphql(await getUserToken(c), { query, variables }));
});

content.post("/history", async (c) => {
  const paths = await contentPaths(c, 50);
  if (!paths) return c.json({ error: "invalid", message: "Invalid request." }, 400);
  const { github } = c.get("config");
  const variables: Record<string, string> = { owner: github.owner, name: github.repo, ref: `refs/heads/${github.branch}` };
  paths.forEach((p, i) => (variables[`h${i}`] = p));
  const fields = "nodes { committedDate author { name user { login databaseId } } }";
  const query = `query($owner: String!, $name: String!, $ref: String!, ${paths.map((_, i) => `$h${i}: String!`).join(", ")}) {
  repository(owner: $owner, name: $name) {
    ref(qualifiedName: $ref) { target { ... on Commit {
${paths.map((_, i) => `      h${i}: history(first: 1, path: $h${i}) { ${fields} }`).join("\n")}
    } } }
  }
}`;
  return forward(await graphql(await getUserToken(c), { query, variables }));
});

/** Largest post or page accepted, in bytes (Markdown text; images are stored separately). */
const MAX_FILE_BYTES = 1024 * 1024;

/** The kind of a published post or page path, or null if it isn't one Alasin edits. */
function publishedKind(config: AlasinConfig, path: string): "post" | "page" | null {
  if (!path.endsWith(".md") || path.startsWith("/") || path.split("/").some((s) => s === ".." || s === "." || s === "")) return null;
  if (path.startsWith(`${config.site.posts_dir}/`)) return "post";
  if (path.startsWith(`${config.site.pages_dir}/`)) return "page";
  return null;
}

async function repoFor(c: Context<AppEnv>): Promise<Repo> {
  const { github } = c.get("config");
  return new Repo(await getUserToken(c), github.owner, github.repo, github.branch);
}

content.get("/file", async (c) => {
  const path = c.req.query("path") ?? "";
  if (!publishedKind(c.get("config"), path)) return c.json({ error: "not_found", message: "No such post or page." }, 404);
  const file = await (await repoFor(c)).getFile(path);
  if (!file) return c.json({ error: "not_found", message: "No such post or page." }, 404);
  return c.json({ path, content: file.content, sha: file.sha });
});

/**
 * An image in the folders Alasin reads, e.g. a drawing next to a bundle's
 * index.md. An SVG gets a policy of its own: nothing it refers to loads and its
 * scripts don't run, even when opened by itself.
 */
content.get("/asset", async (c) => {
  const path = c.req.query("path") ?? "";
  const type = bundleImageType(path);
  const dirs = Object.values(contentDirs(c.get("config")));
  if (!type || !isPlainPath(path) || !dirs.some((d) => path.startsWith(`${d}/`))) return c.json({ error: "not_found", message: "No such image." }, 404);
  const res = await (await repoFor(c)).getRaw(path);
  if (!res) return c.json({ error: "not_found", message: "No such image." }, 404);
  return new Response(res.body, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, no-store",
      ...(type === "image/svg+xml" ? { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" } : {}),
    },
  });
});

const saveBody = z.strictObject({
  path: z.string().max(512),
  content: z.string().max(MAX_FILE_BYTES),
  /** Blob SHA of the version being replaced. */
  sha: z.string().regex(SHA),
  /** The post's day in the author's time zone (YYYY-MM-DD), for image folders and the url. */
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /**
   * The address or date was changed: the file moves to the name the content
   * layout gives (`[site] post_filename` / `page_filename`), and the `url`
   * field follows (if `[site] post_url` / `page_url` is set).
   */
  updateUrl: z.boolean().optional(),
  /** Where photos added in this editing session were uploaded (DRAFTS/<editId>/), cleared after saving. */
  editId: z.string().refine(isUlid).optional(),
  /** The edit lock this editor holds: saving is refused while someone else holds it. */
  lockId: z.string().max(64).optional(),
});

/** Whether `id` names a draft, in the drafts folder or in the Bin (whose images stay until it's emptied). */
async function isDraftId(c: Context<AppEnv>, id: string): Promise<boolean> {
  const config = c.get("config");
  const repo = await repoFor(c);
  const paths = ["post", "page"].flatMap((type) => [`${config.drafts.dir}/${type}s/${id}.md`, `${config.bin.dir}/${config.drafts.dir}/${type}s/${id}.md`]);
  return (await Promise.all(paths.map((p) => repo.getFile(p)))).some(Boolean);
}

/**
 * Saving a published post or page, like publishing: draft images it uses
 * (photos added while editing) are copied to MEDIA first, never overwriting;
 * then one commit replaces the file (which must be unchanged since it was
 * opened), with `lastmod` updated, moving it if its address or date changed;
 * only then are those images removed from DRAFTS. Returns the saved text,
 * which may differ from what was sent, and the file's path.
 */
content.put("/file", async (c) => {
  const length = Number(c.req.header("Content-Length") ?? "0");
  if (length > MAX_FILE_BYTES * 2) return c.json({ error: "too_large", message: "The text is too large." }, 413);
  const parsed = saveBody.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) return c.json({ error: "invalid", message: "Invalid request." }, 400);
  const config = c.get("config");
  const { path, sha, updateUrl, editId } = parsed.data;
  const kind = publishedKind(config, path);
  if (!kind) return c.json({ error: "not_found", message: "No such post or page." }, 404);
  const locked = await lockedBy(c, `file:${path}`, parsed.data.lockId);
  if (locked) return locked;
  if (new TextEncoder().encode(parsed.data.content).length > MAX_FILE_BYTES) return c.json({ error: "too_large", message: "The text is too large." }, 413);
  const info = draftInfo(parsed.data.content);
  if (!info) return c.json({ error: "invalid", message: "The front matter can't be read." }, 422);

  const { success } = await c.env.RL_COMMIT.limit({ key: `commit:${c.get("session").uid}` });
  if (!success) return c.json({ error: "rate_limited", message: "Too many saves. Wait a moment and try again." }, 429);

  // The editing session's photos are removed after saving: never a draft's own (its ID can't be an editId).
  const editPhotos = editId ? await c.var.drafts.list({ prefix: `${editId}/`, limit: 1000 }) : null;
  if (editId && editPhotos?.objects.length && (await isDraftId(c, editId))) {
    return c.json({ error: "invalid", message: "Invalid editing session." }, 400);
  }

  const day = parseDay(parsed.data.day) ?? parseDay(info.date) ?? parseDay(new Date().toISOString())!;
  const refs = draftImageRefs(parsed.data.content);
  let urls: Map<string, string>;
  try {
    urls = await copyDraftImages(c.var.drafts, c.var.media, refs, day, {
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
  const text = withFields(replaceImageUrls(parsed.data.content, urls), maintainedFields(config, kind, info, day, { url: updateUrl === true }));
  // A new address or date: the file follows (not page bundles, whose folder holds other files).
  const target = updateUrl && info.slug && !path.endsWith("/index.md") ? contentPath(config, kind, info.slug, day) : path;
  const title = (info.title || path).replace(/\s+/g, " ");
  try {
    const result = await (await repoFor(c)).commit(
      target === path
        ? [{ path, content: text, expectedSha: sha }]
        : [
            { path: target, content: text, expectedSha: null },
            { path, content: null, expectedSha: sha },
          ],
      `Update ${kind}: ${title}`,
    );
    // The photos added in this editing session now live in MEDIA. (Photos of
    // other drafts the text may refer to stay with their drafts.)
    if (editId && editPhotos?.objects.length) {
      try {
        const listed = await c.var.drafts.list({ prefix: `${editId}/`, limit: 1000 });
        if (listed.objects.length) await c.var.drafts.delete(listed.objects.map((o) => o.key));
      } catch (err) {
        logError({ rid: c.get("requestId"), event: "draft_media_cleanup_failed", uid: c.get("session").uid }, err);
      }
    }
    return c.json({ path: target, content: text, sha: result.shas[target], commit: result.commit });
  } catch (err) {
    if (err instanceof ConflictError) {
      if (err.path === target && target !== path) {
        return c.json({ error: "exists", message: `A ${kind} already exists at ${target}. Choose another address.` }, 409);
      }
      return c.json({ error: "conflict", message: "This was changed somewhere else since you opened it. Reload it to see the latest version." }, 409);
    }
    throw err;
  }
});

