// SPDX-License-Identifier: MIT
//
// Front matter of Hugo content files: YAML between `---` lines or TOML between
// `+++` lines. Reading keeps the field order; writing keeps existing fields in
// their order (unknown ones untouched) and appends new ones.
//
// YAML is written in the style Hugo sites commonly use: strings in double
// quotes, lists in flow style (`["a", "b"]`), dates unquoted.

import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { parse as parseYaml } from "yaml";

export type FrontMatterFormat = "yaml" | "toml";

export interface SplitFile {
  format: FrontMatterFormat;
  /** Front matter text between the delimiters. */
  raw: string;
  /** Everything after the closing delimiter line. */
  body: string;
}

const PATTERNS: Record<FrontMatterFormat, RegExp> = {
  yaml: /^---[ \t]*\r?\n([\s\S]*?)\r?\n?---[ \t]*(?:\r?\n|$)/,
  toml: /^\+\+\+[ \t]*\r?\n([\s\S]*?)\r?\n?\+\+\+[ \t]*(?:\r?\n|$)/,
};

export function splitFrontMatter(text: string): SplitFile | null {
  for (const format of ["yaml", "toml"] as const) {
    const m = PATTERNS[format].exec(text);
    if (m) return { format, raw: m[1]!, body: text.slice(m[0].length) };
  }
  return null;
}

export type FieldValue = string | number | boolean | string[] | null;
export type Fields = Map<string, unknown>;

/** Parses front matter into an ordered map. Dates stay strings. */
export function parseFields(format: FrontMatterFormat, raw: string): Fields {
  if (format === "yaml") {
    const data = (parseYaml(raw) ?? {}) as Record<string, unknown>;
    return new Map(Object.entries(data));
  }
  const data = parseToml(raw) as Record<string, unknown>;
  return new Map(
    Object.entries(data).map(([k, v]) => [k, v instanceof Date ? (v as Date & { toISOString(): string }).toString() : v]),
  );
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

function yamlScalar(v: unknown, key: string): string {
  if (typeof v === "string") return key === "date" || key === "lastmod" || key === "publishDate" ? (ISO_DATE.test(v) ? v : JSON.stringify(v)) : JSON.stringify(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return `[${v.map((x) => yamlScalar(x, "")).join(", ")}]`;
  // Nested values (rare in Hugo front matter) as JSON, which is valid YAML.
  return JSON.stringify(v);
}

/** Writes fields as front matter text (without delimiters). */
export function stringifyFields(format: FrontMatterFormat, fields: Fields): string {
  if (format === "yaml") {
    return [...fields].map(([k, v]) => `${/^[A-Za-z_][A-Za-z0-9_-]*$/.test(k) ? k : JSON.stringify(k)}: ${yamlScalar(v, k)}`).join("\n");
  }
  return stringifyToml(Object.fromEntries([...fields].filter(([, v]) => v !== null && v !== undefined))).trimEnd();
}

export function joinFile(format: FrontMatterFormat, frontMatter: string, body: string): string {
  const d = format === "yaml" ? "---" : "+++";
  return `${d}\n${frontMatter}\n${d}\n${body}`;
}

/**
 * Updates `fields` in place with `changes`: existing keys keep their position,
 * new keys are appended in the order given, and `undefined` removes a key.
 */
export function applyChanges(fields: Fields, changes: [string, unknown][]): Fields {
  for (const [k, v] of changes) {
    if (v === undefined) fields.delete(k);
    else fields.set(k, v);
  }
  return fields;
}

/** A URL slug from a title: "1.8. Akaa – Kylmäkoski" → "1-8-akaa-kylmakoski". */
export function slugify(title: string): string {
  return (
    title
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ß/g, "ss")
      .replace(/æ/gi, "ae")
      .replace(/ø/gi, "o")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100)
      .replace(/-+$/, "") || "untitled"
  );
}

/** `2026-10-15T14:05:00+03:00` for a moment in an IANA time zone (Hugo's date format). */
export function formatDateInZone(date: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const local = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  const offsetMinutes = Math.round((Date.parse(`${local}Z`) - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  return `${local}${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/**
 * The date string for a wall-clock time ("2026-10-15T14:05") in a time zone,
 * e.g. "2026-10-15T14:05:00+03:00", accounting for daylight saving time.
 */
export function zonedLocalToIso(local: string, timeZone: string): string {
  const base = Date.parse(`${local.length === 16 ? `${local}:00` : local}Z`);
  // The offset depends on the instant itself; two passes settle it (also around DST changes).
  let instant = base;
  for (let i = 0; i < 2; i++) {
    const shown = formatDateInZone(new Date(instant), timeZone);
    const shownLocal = Date.parse(`${shown.slice(0, 19)}Z`);
    instant += base - shownLocal;
  }
  return formatDateInZone(new Date(instant), timeZone);
}
