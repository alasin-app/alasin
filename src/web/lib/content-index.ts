// SPDX-License-Identifier: MIT
//
// The list of posts and pages, built in the browser from GET /api/content:
// every Markdown file of the posts, pages, drafts, archive and Bin folders,
// with what the lists and the search need. Where a file is decides its state:
//
//   <posts_dir>/…, <pages_dir>/…        published (or draft, with `draft: true`)
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
  /** Draft ID of drafts saved by Alasin. */
  draftId?: string;
  /** The text without front matter, Markdown, shortcodes and HTML, for searching. */
  text: string;
}

/** Changes when the index gains fields, so older kept copies are read again. */
export const INDEX_VERSION = 2;

export interface ContentIndex {
  version?: number;
  /** Head commit of the branch the index was read from. */
  commit: string;
  items: ContentItem[];
}

type Entry = { name: string; type: string; object: { oid?: string; text?: string | null; isBinary?: boolean; entries?: Entry[] } | null };
type Folders = SiteSettings["folders"];
/** What reading the files needs to know about the site. */
export type IndexSettings = Pick<SiteSettings, "folders" | "authorField">;

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
function classify(path: string, folders: Folders, draftFlag: boolean): { kind: ItemKind; state: Exclude<ItemState, "bin"> } | null {
  if (under(path, folders.posts)) return { kind: "post", state: draftFlag ? "draft" : "published" };
  if (under(path, folders.pages)) return { kind: "page", state: draftFlag ? "draft" : "published" };
  if (under(path, `${folders.drafts}/posts`)) return { kind: "post", state: "draft" };
  if (under(path, `${folders.drafts}/pages`)) return { kind: "page", state: "draft" };
  if (under(path, folders.archive)) {
    const inner = classify(path.slice(folders.archive.length + 1), folders, false);
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
  const what = classify(origin, folders, fields.get("draft") === true);
  if (!what) return null;
  const date = str(fields.get("date"));
  const name = origin.split("/").pop()!.replace(/\.md$/, "");
  const fallback = name === "index" ? origin.split("/").slice(-2, -1)[0]! : name;
  const draftId = fields.get("draftId");
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
    author: site.authorField ? str(fields.get(site.authorField)).trim() : "",
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
  const seen = new Set<string>();
  for (const key of ["posts", "pages", "drafts", "archive", "bin"] as const) {
    const dir = folders[key];
    for (const f of files((repo[key] as { entries?: Entry[] } | null)?.entries)) {
      const path = `${dir}/${f.rel}`;
      if (seen.has(path)) continue;
      seen.add(path);
      // Section list pages (_index.md) aren't posts or pages of their own.
      const it = itemFromFile(path, f.sha, f.text, site);
      if (it) items.push(it);
    }
  }
  return { version: INDEX_VERSION, commit, items };
}

/** A file changed between two commits, as GitHub's compare lists it. */
export interface ChangedFile {
  filename: string;
  status: string;
  previous_filename?: string | null;
}

/** Which listed paths to drop and which to read again after these changes. */
export function changedPaths(files: ChangedFile[], folders: Folders): { remove: string[]; read: string[] } {
  const dirs = [folders.posts, folders.pages, folders.drafts, folders.archive, folders.bin];
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
