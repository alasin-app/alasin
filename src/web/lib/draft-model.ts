// SPDX-License-Identifier: MIT
//
// The editable parts of a draft (title, date, slug, categories, tags, cover,
// author and author_id, body) and the file text committed to the repository. Reopening a draft keeps
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
import { liveAuthorName } from "./authors";
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
  /** The author field's value ("" if the site has no author field or the file none). */
  author: string;
  /** The author's GitHub login (`author_id`), "" if none: who wrote it; `author` is the name last written. */
  authorId: string;
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
  const author = (site.authorField && site.author) || "";
  const authorId = (site.authorField && site.authorIdField && site.login) || "";
  const form: DraftForm = { title: "", date: utcIso(now), slug: "", categories: [], tags: [], cover: "", author, authorId, body: "" };
  // The order of a new file's front matter.
  fields.set("title", "");
  fields.set("date", form.date);
  fields.set("slug", "");
  if (site.authorField && author) fields.set(site.authorField, author);
  if (site.authorIdField && authorId) fields.set(site.authorIdField, authorId);
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
    author: site.authorField ? str(fields.get(site.authorField)) : "",
    authorId: site.authorField && site.authorIdField ? str(fields.get(site.authorIdField)).trim() : "",
    body: split.body.slice(leading.length),
  };
  return { format: split.format, fields, form, raw: { frontMatter: split.raw, formFields: formFields(form), leading, body: form.body } };
}

/** Form fields and the front matter keys they are written to ("cover" and "author" as configured in `[site]`). */
const FORM_KEYS: Exclude<keyof DraftForm, "body">[] = ["title", "date", "slug", "categories", "tags", "cover", "author", "authorId"];

const keyOf = (field: Exclude<keyof DraftForm, "body">, site: SiteSettings) =>
  field === "cover" ? site.coverField : field === "author" ? site.authorField : field === "authorId" ? site.authorIdField : field;

/** The front matter values of the form. A draft's `draft` key is removed: the drafts folder makes it a draft (published files keep theirs). */
function formChanges(f: DraftForm, site: SiteSettings, draft?: boolean): [string, unknown][] {
  return [
    ["title", f.title.trim()],
    ["date", f.date],
    ["slug", f.slug],
    ...(draft ? ([["draft", undefined]] as [string, unknown][]) : []),
    ["categories", f.categories.length ? f.categories : undefined],
    ["tags", f.tags.length ? f.tags : undefined],
    [site.coverField, f.cover ? f.cover : undefined],
    ...(site.authorField ? ([[site.authorField, f.author.trim() || undefined]] as [string, unknown][]) : []),
    ...(site.authorField && site.authorIdField ? ([[site.authorIdField, f.authorId.trim() || undefined]] as [string, unknown][]) : []),
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
      const field = FORM_KEYS.find((k) => keyOf(k, site) === key);
      return !field || JSON.stringify(before[field]) !== JSON.stringify(f[field]);
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
 * What saving commits, and the body and author name to show afterwards. The
 * author name is updated to the current GitHub name of the user in author_id,
 * so the file keeps the last known name. In rich text mode,
 * list items and quote lines left empty while writing and line breaks with
 * nothing after them are tidied away, but only on lines changed since the
 * last saved version (`saved`), so an untouched file saves unchanged. The
 * Markdown mode is raw: nothing is changed there.
 */
export function prepareSave(
  doc: DraftDoc,
  site: SiteSettings,
  opts: { rich: boolean; saved: string | null; draft?: boolean },
): { content: string; body: string; author: string } {
  const keep = opts.saved === null ? undefined : new Set(opts.saved.split("\n"));
  const body = opts.rich ? dropDanglingBreaks(removeEmptyItems(doc.form.body, keep), keep) : doc.form.body;
  const author = site.authorField && site.authorIdField ? liveAuthorName(doc.form, site) : doc.form.author;
  const tidied = body === doc.form.body && author === doc.form.author ? doc : { ...doc, form: { ...doc.form, body, author } };
  return { content: serializeDraft(tidied, site, { draft: opts.draft ?? true }), body, author };
}
