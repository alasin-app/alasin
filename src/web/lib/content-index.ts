// SPDX-License-Identifier: MIT
//
// The list of posts and pages, built in the browser from GET /api/content:
// every Markdown file of the content (or posts and pages), drafts, archive and
// Bin folders, with what the lists and the search need. Other files of the
// content folder (the home page, other sections) only count for which images
// are used. Where a file is decides its state:
//
//   <posts_dir>/…, <pages_dir>/…        published
//   <drafts>/posts/…, <drafts>/pages/…  draft
//   <archive>/<repository path>         archived
//   <bin>/<repository path>             in the Bin, deleted from that path
//
// No browser dependencies, so tests can import it.

import { parseFields, splitFrontMatter } from "../../shared/frontmatter";
import type { SiteSettings } from "./site-types";

export type ItemKind = "post" | "page";
export type ItemState = "published" | "draft" | "archived" | "bin";

export interface ContentItem {
  /** Repository path of the file. */
  path: string;
  /** Blob SHA, the version to save over. */
  sha: string;
  kind: ItemKind;
  state: ItemState;
  /** In the Bin: the path it was deleted from, and the state it had there. */
  origin?: { path: string; state: Exclude<ItemState, "bin"> };
  title: string;
  /** Front matter date as written, "" if none. */
  date: string;
  /** Milliseconds since 1970, NaN without a valid date. */
  time: number;
  slug: string;
  categories: string[];
  tags: string[];
  /** The author field's value, "" if none. */
  author: string;
  /** The author's GitHub login (`author_id`), if the file has one. */
  authorId?: string;
  /** Draft ID of drafts saved by Alasin. */
  draftId?: string;
  /** The text without front matter, Markdown, shortcodes and HTML, for searching. */
  text: string;
}

/** Changes when the index gains fields, so older kept copies are read again. */
export const INDEX_VERSION = 6;

export interface ContentIndex {
  version?: number;
  /** Head commit of the branch the index was read from. */
  commit: string;
  items: ContentItem[];
  /** The published images (MEDIA keys) each file refers to, section pages included; files with none are left out. */
  media?: Record<string, string[]>;
  /** The settings the items were read with (see `settingsKey`). */
  settings?: string;
}

type Entry = { name: string; type: string; object: { oid?: string; text?: string | null; isBinary?: boolean; entries?: Entry[] } | null };
type Folders = SiteSettings["folders"];
/** What reading the files needs to know about the site. */
export type IndexSettings = Pick<SiteSettings, "folders" | "authorField" | "authorIdField" | "media">;

/** The settings an index was read with, to read everything again when they change (e.g. another `author_field`). */
export const settingsKey = (site: IndexSettings): string => JSON.stringify([site.folders, site.authorField, site.authorIdField, site.media]);

/** Whether a stored index can be brought up to date, or must be read again. */
export const reusable = (index: ContentIndex | undefined, site: IndexSettings): index is ContentIndex =>
  index?.version === INDEX_VERSION && index.settings === settingsKey(site);

/** The files of a folder tree, with paths relative to it. */
function files(entries: Entry[] | undefined, prefix = ""): { rel: string; sha: string; text: string }[] {
  const out: { rel: string; sha: string; text: string }[] = [];
  for (const e of entries ?? []) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.object?.entries) out.push(...files(e.object.entries, rel));
    else if (e.type === "blob" && e.name.endsWith(".md") && typeof e.object?.text === "string" && e.object.oid) {
      out.push({ rel, sha: e.object.oid, text: e.object.text });
    }
  }
  return out;
}

const under = (path: string, dir: string) => path.startsWith(`${dir}/`);

/** What a repository path is, outside the Bin; null if it isn't a post or page. */
function classify(path: string, folders: Folders): { kind: ItemKind; state: Exclude<ItemState, "bin"> } | null {
  if (under(path, folders.posts)) return { kind: "post", state: "published" };
  if (under(path, folders.pages)) return { kind: "page", state: "published" };
  if (under(path, `${folders.drafts}/posts`)) return { kind: "post", state: "draft" };
  if (under(path, `${folders.drafts}/pages`)) return { kind: "page", state: "draft" };
  if (under(path, folders.archive)) {
    const inner = classify(path.slice(folders.archive.length + 1), folders);
    return inner ? { kind: inner.kind, state: "archived" } : null;
  }
  return null;
}

/** Plain words of a Markdown text, for searching and snippets. */
export function plainText(body: string): string {
  return body
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, " ") // fenced code
    .replace(/\{\{[<%][\s\S]*?[>%]\}\}/g, " ") // shortcodes
    .replace(/<[^>]+>/g, " ") // HTML tags
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images: their alt text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links: their text
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d{1,9}[.)])\s+/gm, "") // block markers
    .replace(/[*_`~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const str = (v: unknown) => (typeof v === "string" ? v : v instanceof Date ? v.toISOString() : v == null ? "" : String(v));
const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : []);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The MEDIA keys a file refers to: anything after the content prefix or the public URL that looks like an image. */
export function imagesIn(text: string, site: Pick<SiteSettings, "media">): string[] {
  const { contentPrefix, publicUrl } = site.media;
  const starts = [...new Set([contentPrefix, publicUrl].filter(Boolean))].map(escape).join("|");
  if (!starts) return [];
  const keys = new Set<string>();
  for (const m of text.matchAll(new RegExp(`(?:${starts})([^\\s"'()<>\\]]+?\\.(?:jpe?g|png|webp|gif|avif))(?![A-Za-z0-9])`, "gi"))) {
    let key = m[1]!;
    try {
      key = decodeURI(key);
    } catch {
      // Not valid percent-encoding: kept as written.
    }
    keys.add(key);
  }
  return [...keys];
}

/** The list entry for one file, or null if it isn't a post or page. */
export function itemFromFile(path: string, sha: string, text: string, site: IndexSettings): ContentItem | null {
  if (/(^|\/)_index\.md$/.test(path) || !path.endsWith(".md")) return null;
  return item(path, sha, text, site, path.startsWith(`${site.folders.bin}/`));
}

function item(path: string, sha: string, text: string, site: IndexSettings, bin: boolean): ContentItem | null {
  const { folders } = site;
  const split = splitFrontMatter(text);
  let fields: Map<string, unknown> = new Map();
  try {
    if (split) fields = parseFields(split.format, split.raw);
  } catch {
    // Front matter that doesn't parse: listed by its file name.
  }
  const origin = bin ? path.slice(folders.bin.length + 1) : path;
  const what = classify(origin, folders);
  if (!what) return null;
  const date = str(fields.get("date"));
  const name = origin.split("/").pop()!.replace(/\.md$/, "");
  const fallback = name === "index" ? origin.split("/").slice(-2, -1)[0]! : name;
  const draftId = fields.get("draftId");
  const authorId = str(fields.get(site.authorIdField)).trim();
  return {
    path,
    sha,
    kind: what.kind,
    state: bin ? "bin" : what.state,
    ...(bin ? { origin: { path: origin, state: what.state } } : {}),
    title: str(fields.get("title")).trim() || fallback,
    date,
    time: Date.parse(date),
    slug: str(fields.get("slug")),
    categories: list(fields.get("categories")),
    tags: list(fields.get("tags")),
    author: str(fields.get(site.authorField)).trim(),
    ...(authorId ? { authorId } : {}),
    ...(typeof draftId === "string" ? { draftId } : {}),
    text: plainText(split ? split.body : text),
  };
}

/** The index from the body of GET /api/content. */
export function buildIndex(response: unknown, site: IndexSettings): ContentIndex {
  const { folders } = site;
  const r = response as { data?: { repository?: Record<string, { entries?: Entry[] } | { target?: { oid?: string } } | null> | null }; errors?: { message: string }[] };
  const repo = r.data?.repository;
  const commit = (repo?.ref as { target?: { oid?: string } } | null | undefined)?.target?.oid;
  if (!repo || !commit) throw new Error(r.errors?.[0]?.message ?? "The site's content couldn't be read.");
  const items: ContentItem[] = [];
  const media: Record<string, string[]> = {};
  const seen = new Set<string>();
  for (const key of ["content", "posts", "pages", "drafts", "archive", "bin"] as const) {
    const dir = folders[key];
    if (!repo[key] || (key === "content" && !dir)) continue;
    for (const f of files((repo[key] as { entries?: Entry[] } | null)?.entries)) {
      const path = `${dir}/${f.rel}`;
      if (seen.has(path)) continue;
      seen.add(path);
      const images = imagesIn(f.text, site);
      if (images.length) media[path] = images;
      // Section list pages (_index.md) and files outside posts and pages aren't items of their own.
      const it = itemFromFile(path, f.sha, f.text, site);
      if (it) items.push(it);
    }
  }
  return { version: INDEX_VERSION, commit, items, media };
}

/** A file changed between two commits, as GitHub's compare lists it. */
export interface ChangedFile {
  filename: string;
  status: string;
  previous_filename?: string | null;
}

/** Which listed paths to drop and which to read again after these changes. */
export function changedPaths(files: ChangedFile[], folders: Folders): { remove: string[]; read: string[] } {
  const dirs = [folders.content || folders.posts, folders.content || folders.pages, folders.drafts, folders.archive, folders.bin];
  const ours = (p: string | null | undefined) => !!p && p.endsWith(".md") && dirs.some((d) => p.startsWith(`${d}/`));
  const remove = new Set<string>();
  const read = new Set<string>();
  for (const f of files) {
    if (f.previous_filename && ours(f.previous_filename)) remove.add(f.previous_filename);
    if (!ours(f.filename)) continue;
    if (f.status === "removed") remove.add(f.filename);
    else read.add(f.filename);
  }
  for (const p of read) remove.delete(p);
  return { remove: [...remove], read: [...read] };
}


/** Each value of a list field (e.g. tags) or text field (e.g. author) with how many items have it, most used first. */
export function valueCounts(items: ContentItem[], pick: (i: ContentItem) => string[] | string): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const i of items) {
    const v = pick(i);
    for (const x of new Set(Array.isArray(v) ? v : [v])) if (x) counts.set(x, (counts.get(x) ?? 0) + 1);
  }
  return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

const stemOf = (key: string) => key.replace(/\.[A-Za-z0-9]+$/, "");

/**
 * Whether an image is used by any post or page (any state, the Bin included,
 * since those can come back) or any other file of the content folder, such as
 * the home page. A reference to one of its size variants counts;
 * when unsure (a name that ends in a number), it counts as used.
 */
export function mediaUsage(index: ContentIndex): (key: string) => boolean {
  const stems = new Set<string>();
  for (const keys of Object.values(index.media ?? {})) {
    for (const key of keys) {
      const stem = stemOf(key);
      stems.add(stem);
      stems.add(stem.replace(/-\d{2,5}$/, ""));
    }
  }
  return (key) => stems.has(stemOf(key));
}
