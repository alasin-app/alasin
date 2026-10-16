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

/** A moment as a UTC date for front matter: `2026-10-15T11:05:00Z`. */
export function utcIso(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * A front matter date (any offset, or UTC) as the value of a
 * `<input type="datetime-local">`, in the browser's own time zone.
 */
export function toLocalInput(date: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The value of a `datetime-local` input (browser time zone) as a UTC front matter date. */
export function fromLocalInput(value: string): string | null {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : utcIso(d);
}

/** One value written as TOML (a single line). */
function tomlValue(key: string, v: unknown): string {
  // Dates are TOML datetimes, not strings.
  if ((key === "date" || key === "lastmod" || key === "publishDate") && typeof v === "string" && ISO_DATE.test(v)) return v;
  const line = stringifyToml({ [key]: v }).trim();
  return line.slice(line.indexOf("=") + 1).trim();
}

/**
 * Changes some top-level fields of front matter text (without delimiters) in
 * place, line by line: every other line, comment and formatting stays as it
 * was. A changed field keeps its position; a new one is added at the end (TOML:
 * before the first table); `undefined` removes a field.
 */
export function setFields(format: FrontMatterFormat, raw: string, changes: [string, unknown][]): string {
  const lines = raw.split("\n");
  for (const [key, value] of changes) {
    const quoted = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const keyLine =
      format === "yaml" ? new RegExp(`^(?:${quoted}|"${quoted}"|'${quoted}')\\s*:(?:\\s|$)`) : new RegExp(`^(?:${quoted}|"${quoted}")\\s*=`);
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
      if (format === "toml" && /^\s*\[/.test(lines[i]!)) break; // top-level keys only
      if (keyLine.test(lines[i]!)) {
        start = i;
        break;
      }
    }
    // The lines the current value takes: YAML continues on indented lines and
    // "- " list items; TOML until its brackets close.
    let end = start + 1;
    if (start !== -1) {
      if (format === "yaml") {
        while (end < lines.length && (/^\s+\S/.test(lines[end]!) || /^-(\s|$)/.test(lines[end]!))) end++;
      } else {
        let depth = 0;
        for (let i = start; i < lines.length; i++) {
          for (const ch of lines[i]!.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, "")) {
            if (ch === "[") depth++;
            else if (ch === "]") depth--;
          }
          end = i + 1;
          if (depth <= 0) break;
        }
      }
    }
    const written =
      value === undefined || value === null
        ? []
        : [format === "yaml" ? `${/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) ? key : JSON.stringify(key)}: ${yamlScalar(value, key)}` : `${key} = ${tomlValue(key, value)}`];
    if (start !== -1) lines.splice(start, end - start, ...written);
    else if (written.length) {
      let at = lines.length;
      if (format === "toml") {
        const table = lines.findIndex((l) => /^\s*\[/.test(l));
        if (table !== -1) at = table;
      }
      while (at > 0 && lines[at - 1]!.trim() === "") at--;
      lines.splice(at, 0, ...written);
    }
  }
  return lines.join("\n");
}

