// SPDX-License-Identifier: MIT
//
// The editable parts of a draft (title, date, slug, categories, tags, cover,
// body) and the file text committed to the repository. Reopening a draft keeps
// any other front matter fields and their order.

import {
  applyChanges,
  type Fields,
  formatDateInZone,
  type FrontMatterFormat,
  joinFile,
  parseFields,
  splitFrontMatter,
  stringifyFields,
} from "../../shared/frontmatter";
import type { SiteSettings } from "./site";

export interface DraftForm {
  title: string;
  /** Hugo date string with offset, e.g. 2026-10-15T14:05:00+03:00. */
  date: string;
  slug: string;
  categories: string[];
  tags: string[];
  cover: string;
  body: string;
}

export interface DraftDoc {
  format: FrontMatterFormat;
  /** All front matter fields as read, in order (to keep unknown ones). */
  fields: Fields;
  form: DraftForm;
}

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : []);

export function newDraft(id: string, site: SiteSettings, now = new Date()): DraftDoc {
  const fields: Fields = new Map();
  const form: DraftForm = { title: "", date: formatDateInZone(now, site.timezone), slug: "", categories: [], tags: [], cover: "", body: "" };
  // The order of a new file's front matter.
  fields.set("title", "");
  fields.set("date", form.date);
  fields.set("slug", "");
  fields.set("draft", true);
  if (site.authorField && site.author) fields.set(site.authorField, site.author);
  fields.set("draftId", id);
  return { format: site.frontMatterFormat, fields, form };
}

export function parseDraft(text: string, site: SiteSettings): DraftDoc | null {
  const split = splitFrontMatter(text);
  if (!split) return null;
  const fields = parseFields(split.format, split.raw);
  return {
    format: split.format,
    fields,
    form: {
      title: str(fields.get("title")),
      date: str(fields.get("date")),
      slug: str(fields.get("slug")),
      categories: list(fields.get("categories")),
      tags: list(fields.get("tags")),
      cover: str(fields.get(site.coverField)),
      body: split.body.replace(/^\r?\n/, ""),
    },
  };
}

/** The file text to commit. */
export function serializeDraft(doc: DraftDoc, site: SiteSettings): string {
  const f = doc.form;
  const fields = new Map(doc.fields);
  applyChanges(fields, [
    ["title", f.title.trim()],
    ["date", f.date],
    ["slug", f.slug],
    ["draft", true],
    ["categories", f.categories.length ? f.categories : undefined],
    ["tags", f.tags.length ? f.tags : undefined],
    [site.coverField, f.cover ? f.cover : undefined],
  ]);
  // draftId last for new files, unchanged position otherwise.
  if (!fields.has("draftId")) throw new Error("draft without draftId");
  return joinFile(doc.format, stringifyFields(doc.format, fields), `\n${f.body.replace(/\s+$/, "")}\n`);
}
