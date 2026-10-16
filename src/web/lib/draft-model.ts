// SPDX-License-Identifier: MIT
//
// The editable parts of a draft (title, date, slug, categories, tags, cover,
// body) and the file text committed to the repository. Reopening a draft keeps
// any other front matter fields and their order.

import {
  applyChanges,
  setFields,
  type Fields,
  type FrontMatterFormat,
  joinFile,
  parseFields,
  splitFrontMatter,
  stringifyFields,
  utcIso,
} from "../../shared/frontmatter";
import type { SiteSettings } from "./site-types";
import { dropDanglingBreaks } from "./line-breaks";
import { removeEmptyItems } from "./markdown-cleanup";

export interface DraftForm {
  title: string;
  /** Hugo date: UTC for new drafts (2026-10-15T11:05:00Z); existing files keep their own form until edited. */
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
  /**
   * The front matter text as read, kept as is while no form field changes,
   * so opening and saving (or switching to Markdown and back) changes nothing.
   */
  raw?: { frontMatter: string; formFields: string; leading: string; body: string };
}

/** The form fields that live in front matter, for detecting changes. */
function formFields(f: DraftForm): string {
  const { body: _body, ...rest } = f;
  return JSON.stringify(rest);
}

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : []);

export function newDraft(id: string, site: SiteSettings, now = new Date()): DraftDoc {
  const fields: Fields = new Map();
  const form: DraftForm = { title: "", date: utcIso(now), slug: "", categories: [], tags: [], cover: "", body: "" };
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
  const leading = /^\r?\n/.exec(split.body)?.[0] ?? "";
  const form: DraftForm = {
      title: str(fields.get("title")),
      date: str(fields.get("date")),
      slug: str(fields.get("slug")),
      categories: list(fields.get("categories")),
      tags: list(fields.get("tags")),
    cover: str(fields.get(site.coverField)),
    body: split.body.slice(leading.length),
  };
  return { format: split.format, fields, form, raw: { frontMatter: split.raw, formFields: formFields(form), leading, body: form.body } };
}

/** Form fields and the front matter keys they are written to ("cover" is `[site] cover_field`). */
const FORM_KEYS: [Exclude<keyof DraftForm, "body">, string][] = [
  ["title", "title"],
  ["date", "date"],
  ["slug", "slug"],
  ["categories", "categories"],
  ["tags", "tags"],
  ["cover", "cover"],
];

/** The front matter values of the form. `draft` is set only for drafts (published files keep theirs). */
function formChanges(f: DraftForm, site: SiteSettings, draft?: boolean): [string, unknown][] {
  return [
    ["title", f.title.trim()],
    ["date", f.date],
    ["slug", f.slug],
    ...(draft ? ([["draft", true]] as [string, unknown][]) : []),
    ["categories", f.categories.length ? f.categories : undefined],
    ["tags", f.tags.length ? f.tags : undefined],
    [site.coverField, f.cover ? f.cover : undefined],
  ];
}

/** The file text to commit. */
export function serializeDraft(doc: DraftDoc, site: SiteSettings, opts: { draft?: boolean } = { draft: true }): string {
  const f = doc.form;
  // A changed text ends with a newline; an unchanged one stays exactly as it was.
  const body = f.body === "" || f.body.endsWith("\n") || f.body === doc.raw?.body ? f.body : `${f.body}\n`;
  // Unchanged form: the front matter text exactly as it was.
  if (doc.raw && doc.raw.formFields === formFields(f)) return joinFile(doc.format, doc.raw.frontMatter, doc.raw.leading + body);
  const changes = formChanges(f, site, opts.draft);
  // An existing file: only the changed fields' lines change.
  if (doc.raw) {
    const before = JSON.parse(doc.raw.formFields) as Omit<DraftForm, "body">;
    const changed = changes.filter(([key]) => {
      const field = FORM_KEYS.find(([, k]) => (k === "cover" ? site.coverField : k) === key);
      return !field || JSON.stringify(before[field[0]]) !== JSON.stringify(f[field[0]]);
    });
    return joinFile(doc.format, setFields(doc.format, doc.raw.frontMatter, changed), doc.raw.leading + body);
  }
  const fields = new Map(doc.fields);
  applyChanges(fields, changes);
  // draftId last for new files, unchanged position otherwise.
  if (opts.draft && !fields.has("draftId")) throw new Error("draft without draftId");
  return joinFile(doc.format, stringifyFields(doc.format, fields), `\n${body}`);
}

/**
 * What saving commits, and the body to show afterwards. In rich text mode,
 * list items and quote lines left empty while writing and line breaks with
 * nothing after them are tidied away, but only on lines changed since the
 * last saved version (`saved`), so an untouched file saves unchanged. The
 * Markdown mode is raw: nothing is changed there.
 */
export function prepareSave(
  doc: DraftDoc,
  site: SiteSettings,
  opts: { rich: boolean; saved: string | null; draft?: boolean },
): { content: string; body: string } {
  const keep = opts.saved === null ? undefined : new Set(opts.saved.split("\n"));
  const body = opts.rich ? dropDanglingBreaks(removeEmptyItems(doc.form.body, keep), keep) : doc.form.body;
  const tidied = body === doc.form.body ? doc : { ...doc, form: { ...doc.form, body } };
  return { content: serializeDraft(tidied, site, { draft: opts.draft ?? true }), body };
}
