// SPDX-License-Identifier: MIT
//
// Category management, for sites that keep one term page per category
// (`[categories] storage = "term-pages"`: `<path>/<slug>/_index.md`).
//
//   POST /api/categories        {title, slug, parent?}          add one
//   POST /api/categories/update {slug, title?, newSlug?, parent?, changes}
//   POST /api/categories/delete {slug, changes: [{path, sha, content}]}
//
// Deleting a category that posts or pages use also takes it out of them, and
// changing its address (slug) renames it in them: the browser sends those
// files changed (`changes`), and everything happens in one commit. A category
// with subcategories can't be deleted. Unlike posts and pages, a deleted
// category's term page doesn't go to the Bin; git keeps its history.
//
// A category whose address changes keeps the old one as a Hugo alias, so
// existing links still work: a new slug moves its term page to the new
// folder, and with a `url_pattern` that uses {path}, moving it under another
// parent changes its address and those of everything below it.

import { type Context, Hono } from "hono";
import { z } from "zod";
import type { AlasinConfig } from "../../shared/config/schema";
import { joinFile, parseFields, setFields, slugify, splitFrontMatter, stringifyFields } from "../../shared/frontmatter";
import { isUlid } from "../../shared/ulid";
import type { AppEnv } from "../app";
import { lockedBy } from "../lib/lock-check";
import { ConflictError, type FileChange, readFolderTexts, Repo } from "../lib/repo";
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

/** The slugs of every category below `slug`. */
function descendants(all: Term[], slug: string): Set<string> {
  const out = new Set<string>();
  for (let level = [slug]; level.length; ) {
    level = all.filter((t) => t.parent && level.includes(t.parent) && !out.has(t.slug) && t.slug !== slug).map((t) => t.slug);
    level.forEach((s) => out.add(s));
  }
  return out;
}

/** Slugs from the top-level category down to `slug`, for {path}. */
function chainOf(all: Term[], slug: string, parent?: string): string[] {
  const chain = [slug];
  for (let p = parent; p && chain.length < 20; p = all.find((t) => t.slug === p)?.parent) chain.unshift(p);
  return chain;
}

const categoriesOf = (text: string): string[] => {
  const split = splitFrontMatter(text);
  const cats = split ? parseFields(split.format, split.raw).get("categories") : undefined;
  return Array.isArray(cats) ? cats.map(String) : typeof cats === "string" && cats ? [cats] : [];
};

const changesBody = z
  .array(z.strictObject({ path: z.string().max(512), sha: z.string().regex(/^[0-9a-f]{40}$/), content: z.string().max(MAX_FILE_BYTES) }))
  .max(500);

/**
 * Refuses posts and pages sent with a category change (`changes`) that are
 * outside the content folders, don't have their categories as `fits` wants,
 * or are open in someone else's editor.
 */
async function refuseChanges(c: Context<AppEnv>, changes: z.infer<typeof changesBody>, fits: (categories: string[]) => boolean): Promise<Response | null> {
  const config = c.get("config");
  const dirs = [config.site.posts_dir, config.site.pages_dir, config.drafts.dir, config.archive.dir, config.bin.dir];
  for (const ch of changes) {
    const safe = ch.path.endsWith(".md") && !ch.path.split("/").some((s) => s === ".." || s === "." || s === "") && dirs.some((d) => ch.path.startsWith(`${d}/`));
    if (!safe || !splitFrontMatter(ch.content) || !fits(categoriesOf(ch.content))) return c.json({ error: "invalid", message: `Invalid change to ${ch.path}.` }, 400);
  }
  for (const ch of changes) {
    const key = lockKeyOf(config, ch.path);
    const split = splitFrontMatter(ch.content)!;
    const title = parseFields(split.format, split.raw).get("title");
    const locked = key ? await lockedBy(c, key, undefined, typeof title === "string" && title ? `“${title}”` : ch.path) : null;
    if (locked) return locked;
  }
  return null;
}

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

  const chain = chainOf(all, slug, parent);
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

const deleteBody = z.strictObject({ slug: z.string().min(1).max(100), changes: changesBody });

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

  // The posts and pages changed no longer have the category, and nobody else has them open.
  const refused = await refuseChanges(c, changes, (cats) => !cats.includes(slug));
  if (refused) return refused;

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

const updateBody = z.strictObject({
  slug: z.string().min(1).max(100),
  title: z.string().trim().min(1).max(200).optional(),
  newSlug: z.string().max(100).optional(),
  /** The new parent's slug, "" for the top level; left out, the parent stays. */
  parent: z.string().max(100).optional(),
  changes: changesBody,
});

categories.post("/update", async (c) => {
  const parsed = updateBody.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) return c.json({ error: "invalid", message: "Invalid request." }, 400);
  const config = c.get("config");
  const { slug, title, changes } = parsed.data;
  const all = await terms(c);
  const self = all.find((t) => t.slug === slug);
  if (!self) return c.json({ error: "not_found", message: "No such category." }, 404);

  const newSlug = parsed.data.newSlug === undefined ? slug : slugify(parsed.data.newSlug);
  if (!newSlug) return c.json({ error: "invalid", message: "Give the category an address." }, 400);
  const renamed = newSlug !== slug;
  if (renamed && all.some((t) => t.slug === newSlug)) return c.json({ error: "exists", message: `A category with the address “${newSlug}” already exists.` }, 409);
  const parent = parsed.data.parent === undefined ? self.parent : parsed.data.parent || undefined;
  if (parent && !all.some((t) => t.slug === parent)) return c.json({ error: "invalid", message: "The parent category doesn't exist." }, 400);
  if (parent && (parent === slug || descendants(all, slug).has(parent))) {
    return c.json({ error: "invalid", message: "A category can't be moved under itself or one of its subcategories." }, 400);
  }
  const moved = parent !== self.parent;

  // Posts and pages change only with the address: from the old slug to the new one.
  if (!renamed && changes.length) return c.json({ error: "invalid", message: "Invalid request." }, 400);
  const refused = await refuseChanges(c, changes, (cats) => cats.includes(newSlug) && !cats.includes(slug));
  if (refused) return refused;

  const repo = await repoFor(c);
  // A new address moves the term page; anything else in its folder would be left behind.
  if (renamed && (await repo.listDir(`${config.categories.path}/${slug}`)).some((e) => e.name !== "_index.md")) {
    return c.json({ error: "has_files", message: "The category's folder has other files besides its term page. Move them by hand first." }, 409);
  }

  // The categories as they will be, and the term pages that change: this one,
  // its children (their parent) and, when addresses follow the tree, everything below it.
  const after = all.map((t) => (t.slug === slug ? { slug: newSlug, ...(parent ? { parent } : {}) } : t.parent === slug ? { ...t, parent: newSlug } : t));
  const pattern = config.categories.url_pattern;
  const byPath = !!pattern?.includes("{path}") && (renamed || moved);
  const below = descendants(after, newSlug);
  const affected = [newSlug, ...after.filter((t) => below.has(t.slug) && ((renamed && t.parent === newSlug) || byPath)).map((t) => t.slug)];
  const taxonomy = config.categories.path.split("/").pop()!;
  const parentField = config.categories.parent_field;

  const fileChanges: FileChange[] = [];
  for (const s of affected) {
    const own = s === newSlug;
    const file = await repo.getFile(termPath(config, own ? slug : s));
    if (!file) return c.json({ error: "conflict", message: "Something changed meanwhile. Reload and try again." }, 409);
    const split = splitFrontMatter(file.content) ?? { format: config.site.front_matter_format, raw: "", body: file.content };
    const fields = parseFields(split.format, split.raw);
    const updates: [string, unknown][] = [];
    if (own) {
      if (title && title !== fields.get("title")) updates.push(["title", title]);
      if (renamed && fields.has("slug")) updates.push(["slug", newSlug]);
      if (moved) updates.push([parentField, parent]);
    } else if (renamed && fields.get(parentField) === slug) {
      updates.push([parentField, newSlug]);
    }
    // Its address: the pattern's (or the url it has), else Hugo's /<taxonomy>/<slug>/. A changed one keeps the old as an alias.
    if ((own && (renamed || byPath)) || (!own && byPath)) {
      const oldUrl = typeof fields.get("url") === "string" ? (fields.get("url") as string) : "";
      const newUrl = pattern ? pattern.replaceAll("{slug}", s).replaceAll("{path}", chainOf(after, s, after.find((t) => t.slug === s)?.parent).join("/")) : oldUrl;
      const oldAddress = oldUrl || `/${taxonomy}/${own ? slug : s}/`;
      const newAddress = newUrl || `/${taxonomy}/${s}/`;
      if (newUrl !== oldUrl) updates.push(["url", newUrl]);
      if (newAddress !== oldAddress) {
        const had = fields.get("aliases");
        const aliases = (Array.isArray(had) ? had.map(String) : []).filter((a) => a !== newAddress);
        updates.push(["aliases", aliases.includes(oldAddress) ? aliases : [...aliases, oldAddress]]);
      }
    }
    const content = updates.length ? joinFile(split.format, setFields(split.format, split.raw, updates), split.body) : file.content;
    if (own && renamed) {
      fileChanges.push({ path: file.path, content: null, expectedSha: file.sha }, { path: termPath(config, newSlug), content, expectedSha: null });
    } else if (updates.length) {
      fileChanges.push({ path: file.path, content, expectedSha: file.sha });
    }
  }
  if (!fileChanges.length) return c.json({ slug: newSlug, changed: 0 });

  const what = [
    renamed ? `Rename category ${slug} to ${newSlug}` : moved ? `Move category ${slug}` : `Edit category ${slug}`,
    ...(renamed && moved ? [" and move it"] : []),
    ...(moved ? [` ${parent ? `under ${parent}` : "to the top level"}`] : []),
    ...(changes.length ? [`, updating ${changes.length} ${changes.length === 1 ? "item" : "items"}`] : []),
  ].join("");
  try {
    await repo.commit([...fileChanges, ...changes.map((ch) => ({ path: ch.path, content: ch.content, expectedSha: ch.sha }))], what);
  } catch (err) {
    if (err instanceof ConflictError) return c.json({ error: "conflict", message: "Something changed meanwhile. Reload and try again." }, 409);
    throw err;
  }
  return c.json({ slug: newSlug, changed: changes.length });
});
