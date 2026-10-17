// SPDX-License-Identifier: MIT
//
// The text side of publishing a draft: which draft images it uses, where the
// file and its images go, and the published file text. The Worker's publish
// route does the copying and the commit.

import type { AlasinConfig } from "./config/schema";
import { joinFile, parseFields, setFields, slugify, splitFrontMatter, utcIso } from "./frontmatter";

/** A draft image as written in Markdown: `/api/draft-media/<draftId>/<file>`. */
const DRAFT_IMAGE = /\/api\/draft-media\/([0-9A-HJKMNP-TV-Z]{26})\/([a-z0-9][a-z0-9_-]{0,79}\.(?:jpg|png|webp|gif))/g;

export interface DraftImageRef {
  draftId: string;
  file: string;
}

/** The draft images a text refers to, each once, in order of first use. */
export function draftImageRefs(text: string): DraftImageRef[] {
  const seen = new Map<string, DraftImageRef>();
  for (const m of text.matchAll(DRAFT_IMAGE)) {
    const key = `${m[1]}/${m[2]}`;
    if (!seen.has(key)) seen.set(key, { draftId: m[1]!, file: m[2]! });
  }
  return [...seen.values()];
}

export interface Day {
  yyyy: string;
  mm: string;
  dd: string;
}

/** `YYYY-MM-DD` as its parts, or null if it isn't a valid date. */
export function parseDay(value: string | undefined): Day | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  if (!m) return null;
  // Round trip, so 2026-02-31 doesn't pass as 3 March.
  const d = new Date(`${m[0]}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== m[0]) return null;
  return { yyyy: m[1]!, mm: m[2]!, dd: m[3]! };
}

/** The R2 key of a published image, from `[media] path_pattern`. */
export function mediaKey(pattern: string, day: Day, name: string, ext: string): string {
  return pattern.replaceAll("{yyyy}", day.yyyy).replaceAll("{mm}", day.mm).replaceAll("{dd}", day.dd).replaceAll("{name}", name).replaceAll("{ext}", ext);
}

/** Where a published post or page goes, from the content layout in `[site]`. */
export function contentPath(config: AlasinConfig, type: "post" | "page", slug: string, day: Day): string {
  const { site } = config;
  const pattern = type === "post" ? site.post_filename : site.page_filename;
  const file = pattern.replaceAll("{slug}", slug).replaceAll("{yyyy}", day.yyyy).replaceAll("{mm}", day.mm).replaceAll("{dd}", day.dd);
  return `${type === "post" ? site.posts_dir : site.pages_dir}/${file}`;
}

export interface DraftInfo {
  title: string;
  date: string;
  /** The slug for the file name: the draft's own, or one made from the title. */
  slug: string;
}

/** Title, date and slug of a draft file, or null if it has no front matter. */
export function draftInfo(text: string): DraftInfo | null {
  const split = splitFrontMatter(text);
  if (!split) return null;
  const fields = parseFields(split.format, split.raw);
  const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
  const title = str(fields.get("title")).trim();
  const own = slugify(str(fields.get("slug")));
  return { title, date: str(fields.get("date")), slug: own !== "untitled" ? own : title ? slugify(title) : "" };
}

/** A `url` field value from `[site] post_url` / `page_url`. */
export function contentUrl(pattern: string, slug: string, day: Day): string {
  return pattern.replaceAll("{slug}", slug).replaceAll("{yyyy}", day.yyyy).replaceAll("{mm}", day.mm).replaceAll("{dd}", day.dd);
}

/** Draft image URLs replaced by their public ones, anywhere in the file. */
export function replaceImageUrls(text: string, urls: Map<string, string>): string {
  return text.replace(DRAFT_IMAGE, (whole, id: string, file: string) => urls.get(`${id}/${file}`) ?? whole);
}

/** Changes front matter fields of a whole file line by line (see setFields). */
export function withFields(text: string, changes: [string, unknown][]): string {
  const split = splitFrontMatter(text);
  if (!split) throw new Error("file without front matter");
  return joinFile(split.format, setFields(split.format, split.raw, changes), split.body);
}

/** What publishing and saving keep up to date: `lastmod` and, with a pattern, `url`. */
export function maintainedFields(config: AlasinConfig, type: "post" | "page", info: { slug: string }, day: Day, opts: { url: boolean; now?: Date }): [string, unknown][] {
  const out: [string, unknown][] = [];
  if (config.site.lastmod_field) out.push([config.site.lastmod_field, utcIso(opts.now ?? new Date())]);
  const pattern = type === "post" ? config.site.post_url : config.site.page_url;
  if (opts.url && pattern && info.slug) out.push(["url", contentUrl(pattern, info.slug, day)]);
  return out;
}

/**
 * The published file: draft image URLs replaced by their public ones, no
 * `draft` key (Hugo's default is published) and no `draftId`, plus `extra`
 * fields. Everything else in the front matter stays exactly as written.
 */
export function publishedText(text: string, urls: Map<string, string>, extra: [string, unknown][] = []): string {
  return withFields(replaceImageUrls(text, urls), [["draft", undefined], ["draftId", undefined], ...extra]);
}
