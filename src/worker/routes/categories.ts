// SPDX-License-Identifier: MIT
//
// Category management, for sites that keep one term page per category
// (`[categories] storage = "term-pages"`: `<path>/<slug>/_index.md`).
//
//   POST /api/categories        {title, slug, parent?}          add one
//   POST /api/categories/delete {slug, changes: [{path, sha, content}]}
//
// Deleting a category that posts or pages use also takes it out of them: the
// browser sends those files without it (`changes`), and everything happens in
// one commit. A category with subcategories can't be deleted. Unlike posts
// and pages, a deleted category's term page doesn't go to the Bin; git keeps
// its history.

import { type Context, Hono } from "hono";
import { z } from "zod";
import type { AlasinConfig } from "../../shared/config/schema";
import { joinFile, parseFields, slugify, splitFrontMatter, stringifyFields } from "../../shared/frontmatter";
import { isUlid } from "../../shared/ulid";
import type { AppEnv } from "../app";
import { lockedBy } from "../lib/lock-check";
import { ConflictError, readFolderTexts, Repo } from "../lib/repo";
import { getUserToken } from "../session";

const MAX_FILE_BYTES = 1024 * 1024;

interface Term {
  slug: string;
  parent?: string;
}

/** The categories' term pages: slug and parent. */
async function terms(c: Context<AppEnv>): Promise<Term[]> {
  const config = c.get("config");
  const { owner, repo, branch } = config.github;
  const out: Term[] = [];
  for (const f of await readFolderTexts(await getUserToken(c), owner, repo, branch, config.categories.path)) {
    const m = /^([^/]+)\/_index\.md$/.exec(f.path);
    if (!m) continue;
    const split = splitFrontMatter(f.text);
    const parent = split ? parseFields(split.format, split.raw).get(config.categories.parent_field) : undefined;
    out.push({ slug: m[1]!, ...(typeof parent === "string" && parent ? { parent } : {}) });
  }
  return out;
}

async function repoFor(c: Context<AppEnv>): Promise<Repo> {
  const { github } = c.get("config");
  return new Repo(await getUserToken(c), github.owner, github.repo, github.branch);
}

/** The edit lock of a file the editor opens: a published post or page, or a draft (archive and Bin have none). */
function lockKeyOf(config: AlasinConfig, path: string): string | null {
  if (path.startsWith(`${config.site.posts_dir}/`) || path.startsWith(`${config.site.pages_dir}/`)) return `file:${path}`;
  const draft = /^(.+)\/(?:post|page)s\/([0-9A-Z]{26})\.md$/.exec(path);
  return draft && draft[1] === config.drafts.dir && isUlid(draft[2]!) ? `draft:${draft[2]}` : null;
}

const termPath = (config: AlasinConfig, slug: string) => `${config.categories.path}/${slug}/_index.md`;

export const categories = new Hono<AppEnv>();

// Only term pages can be managed here.
categories.use("*", async (c, next) => {
  if (c.get("config").categories.storage !== "term-pages") {
    return c.json({ error: "unsupported", message: "Categories can be managed in the app only when they are term pages ([categories] storage = \"term-pages\")." }, 400);
  }
  return next();
});

const addBody = z.strictObject({
  title: z.string().trim().min(1).max(200),
  slug: z.string().max(100).optional(),
  parent: z.string().max(100).optional(),
});

categories.post("/", async (c) => {
  const parsed = addBody.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) return c.json({ error: "invalid", message: "Give the category a name." }, 400);
  const config = c.get("config");
  const { title } = parsed.data;
  const slug = slugify(parsed.data.slug || title);
  const all = await terms(c);
  if (all.some((t) => t.slug === slug)) return c.json({ error: "exists", message: `A category with the address “${slug}” already exists.` }, 409);
  const parent = parsed.data.parent || undefined;
  if (parent && !all.some((t) => t.slug === parent)) return c.json({ error: "invalid", message: "The parent category doesn't exist." }, 400);

  // Slugs from the top-level category down to this one, for {path}.
  const chain = [slug];
  for (let p = parent; p && chain.length < 20; p = all.find((t) => t.slug === p)?.parent) chain.unshift(p);
  const fields = new Map<string, unknown>([
    ["title", title],
    ["slug", slug],
    ...(parent ? ([[config.categories.parent_field, parent]] as [string, unknown][]) : []),
    ...(config.categories.url_pattern
      ? ([["url", config.categories.url_pattern.replaceAll("{slug}", slug).replaceAll("{path}", chain.join("/"))]] as [string, unknown][])
      : []),
  ]);
  const format = config.site.front_matter_format;
  const path = termPath(config, slug);
  try {
    await (await repoFor(c)).commit([{ path, content: joinFile(format, stringifyFields(format, fields), ""), expectedSha: null }], `Add category: ${title}`);
  } catch (err) {
    if (err instanceof ConflictError) return c.json({ error: "exists", message: `A category with the address “${slug}” already exists.` }, 409);
    throw err;
  }
  return c.json({ slug, path });
});

const deleteBody = z.strictObject({
  slug: z.string().min(1).max(100),
  changes: z
    .array(z.strictObject({ path: z.string().max(512), sha: z.string().regex(/^[0-9a-f]{40}$/), content: z.string().max(MAX_FILE_BYTES) }))
    .max(500),
});

categories.post("/delete", async (c) => {
  const parsed = deleteBody.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) return c.json({ error: "invalid", message: "Invalid request." }, 400);
  const config = c.get("config");
  const { slug, changes } = parsed.data;
  const all = await terms(c);
  if (!all.some((t) => t.slug === slug)) return c.json({ error: "not_found", message: "No such category." }, 404);
  const children = all.filter((t) => t.parent === slug).map((t) => t.slug);
  if (children.length) {
    return c.json({ error: "has_children", message: "Move or delete its subcategories first.", children }, 409);
  }

  // The posts and pages changed must be inside the content folders, and must no longer have the category.
  const dirs = [config.site.posts_dir, config.site.pages_dir, config.drafts.dir, config.archive.dir, config.bin.dir];
  for (const ch of changes) {
    const safe = ch.path.endsWith(".md") && !ch.path.split("/").some((s) => s === ".." || s === "." || s === "") && dirs.some((d) => ch.path.startsWith(`${d}/`));
    const split = splitFrontMatter(ch.content);
    const cats = split ? parseFields(split.format, split.raw).get("categories") : undefined;
    const still = Array.isArray(cats) ? cats.map(String).includes(slug) : cats === slug;
    if (!safe || !split || still) return c.json({ error: "invalid", message: `Invalid change to ${ch.path}.` }, 400);
  }

  // Nothing someone else has open in the editor is changed.
  for (const ch of changes) {
    const key = lockKeyOf(config, ch.path);
    const split = splitFrontMatter(ch.content)!;
    const title = parseFields(split.format, split.raw).get("title");
    const locked = key ? await lockedBy(c, key, undefined, typeof title === "string" && title ? `“${title}”` : ch.path) : null;
    if (locked) return locked;
  }

  const repo = await repoFor(c);
  const page = await repo.getFile(termPath(config, slug));
  if (!page) return c.json({ error: "not_found", message: "No such category." }, 404);
  try {
    await repo.commit(
      [{ path: page.path, content: null, expectedSha: page.sha }, ...changes.map((ch) => ({ path: ch.path, content: ch.content, expectedSha: ch.sha }))],
      changes.length ? `Delete category ${slug}, removing it from ${changes.length} ${changes.length === 1 ? "item" : "items"}` : `Delete category ${slug}`,
    );
  } catch (err) {
    if (err instanceof ConflictError) {
      return c.json({ error: "conflict", message: "Something changed meanwhile. Reload and try again." }, 409);
    }
    throw err;
  }
  return c.json({ deleted: slug, changed: changes.length });
});
