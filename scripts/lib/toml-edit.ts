// SPDX-License-Identifier: MIT
//
// Minimal comment-preserving TOML editing for `npm run setup`: sets one key in
// one table, keeping every comment and all other lines untouched. A commented
// example of the key (`# key = …`) is replaced in place, so values end up next
// to their documentation. Callers re-parse the result to verify it.

export type TomlValue = string | number | boolean | TomlValue[] | { [k: string]: TomlValue };

export function literal(v: TomlValue): string {
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    if (v.length && typeof v[0] === "object" && !Array.isArray(v[0])) {
      return `[\n${v.map((x) => `  ${literal(x)},`).join("\n")}\n]`;
    }
    return `[${v.map(literal).join(", ")}]`;
  }
  return `{ ${Object.entries(v)
    .map(([k, x]) => `${bareKey(k)} = ${literal(x)}`)
    .join(", ")} }`;
}

function bareKey(k: string): string {
  return /^[A-Za-z0-9_-]+$/.test(k) ? k : JSON.stringify(k);
}

const HEADER = /^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*(#.*)?$/;

interface Block {
  /** Index of the header line, or -1 for the root table. */
  start: number;
  /** Index one past the last line of the block. */
  end: number;
}

/** Lines that open a table: `[name]` or `[[name]]`, not commented. */
function blocks(lines: string[], header: string): Block[] {
  const out: Block[] = [];
  const isArray = header.startsWith("[[");
  const name = header.replace(/^\[\[?|\]\]?$/g, "").trim();
  if (header === "") {
    const firstHeader = lines.findIndex((l) => HEADER.test(l));
    return [{ start: -1, end: firstHeader === -1 ? lines.length : firstHeader }];
  }
  for (let i = 0; i < lines.length; i++) {
    const m = HEADER.exec(lines[i]!);
    if (!m) continue;
    const lineIsArray = lines[i]!.trim().startsWith("[[");
    if (m[1] !== name || lineIsArray !== isArray) continue;
    let end = i + 1;
    while (end < lines.length && !HEADER.test(lines[end]!)) end++;
    out.push({ start: i, end });
  }
  return out;
}

/** Index range [from, to) of a key's assignment within a block, following multi-line arrays. */
function findKey(lines: string[], block: Block, key: string, includeCommented: boolean): [number, number] | null {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const live = new RegExp(`^\\s*${k}\\s*=`);
  const commented = new RegExp(`^\\s*#\\s*${k}\\s*=`);
  for (const pattern of includeCommented ? [live, commented] : [live]) {
    for (let i = block.start + 1; i < block.end; i++) {
      if (!pattern.test(lines[i]!)) continue;
      const isCommented = pattern === commented;
      let j = i + 1;
      const rest = lines[i]!.slice(lines[i]!.indexOf("=") + 1).trim();
      if (rest.startsWith("[") && !balanced(rest)) {
        let depth = depthOf(rest);
        while (j < block.end && depth > 0) {
          const l = isCommented ? lines[j]!.replace(/^\s*#\s?/, "") : lines[j]!;
          depth += depthOf(l);
          j++;
        }
      }
      return [i, j];
    }
  }
  return null;
}

function stripStrings(s: string): string {
  return s.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '""').replace(/#.*$/, "");
}

function depthOf(s: string): number {
  const t = stripStrings(s);
  return (t.match(/\[/g)?.length ?? 0) - (t.match(/\]/g)?.length ?? 0);
}

function balanced(s: string): boolean {
  return depthOf(s) <= 0;
}

export interface SetOptions {
  /** For `[[array]]` tables: pick the block where `key = value` (e.g. binding = "DRAFTS"). */
  where?: { key: string; value: string };
}

/**
 * Sets `key` in the table `header` (`""` for the root, `"[app]"`, `"[[r2_buckets]]"`).
 * Creates the table at the end of the file if it doesn't exist.
 */
export function setValue(text: string, header: string, key: string, value: TomlValue, opts: SetOptions = {}): string {
  const lines = text.split("\n");
  const assignment = `${bareKey(key)} = ${literal(value)}`;
  let candidates = blocks(lines, header);
  if (opts.where) {
    const { key: wk, value: wv } = opts.where;
    candidates = candidates.filter((b) => {
      const r = findKey(lines, b, wk, false);
      return r && lines[r[0]]!.includes(JSON.stringify(wv));
    });
  }
  const block = candidates[0];
  if (!block) {
    const extra = opts.where ? `${bareKey(opts.where.key)} = ${JSON.stringify(opts.where.value)}\n` : "";
    const sep = text.endsWith("\n") ? "\n" : "\n\n";
    return `${text}${sep}${header}\n${extra}${assignment}\n`;
  }
  const range = findKey(lines, block, key, true);
  if (range) {
    const indent = /^\s*/.exec(lines[range[0]]!)![0].replace(/#\s*/, "");
    lines.splice(range[0], range[1] - range[0], ...`${indent}${assignment}`.split("\n"));
  } else {
    // After the header, or after the root table's leading comment block.
    let at = block.start + 1;
    if (block.start === -1) {
      at = 0;
      while (at < block.end && (lines[at]!.startsWith("#") || lines[at]!.trim() === "")) at++;
    }
    lines.splice(at, 0, ...assignment.split("\n"));
  }
  return lines.join("\n");
}

/** Appends a block of text (e.g. a new [env.dev] section) at the end. */
export function appendSection(text: string, section: string): string {
  return `${text.replace(/\n*$/, "\n")}\n${section.replace(/\n*$/, "\n")}`;
}
