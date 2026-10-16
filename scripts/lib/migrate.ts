// SPDX-License-Identifier: MIT
//
// Upgrades an alasin.toml written for an older Alasin version, so operators
// don't have to edit removed or renamed options by hand. Comments and all
// other lines are kept. Each migration says what it changed.

import { parse } from "smol-toml";
import { parseConfig, selectEnvironment } from "../../src/shared/config/schema";

export interface Migration {
  text: string;
  changes: string[];
}

const HEADER = /^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*(#.*)?$/;

// v0.9.0: the introduction above [drafts] in alasin.example.toml.
const OLD_DRAFTS_INTRO = [
  "# Draft IMAGES always go to the private DRAFTS bucket. This decides where draft",
  "# TEXT lives. Both options are server-side, so a draft started on the phone can",
  "# be finished on the laptop.",
];
const NEW_DRAFTS_INTRO = [
  "# Drafts are committed to the site repository, in their own folder, so they",
  "# have version history and can be finished on another device. Images, including",
  "# those of drafts, always go to R2, never into git: draft images to the private",
  "# DRAFTS bucket, published images to MEDIA.",
  "#",
  "# Anyone who can read the repository can read the drafts: keep the site",
  "# repository private (recommended).",
];
const DIR_COMMENT = [
  "# Folder for drafts in the site repository. Must be outside Hugo's content",
  "# directory, so Hugo never builds drafts. Tip: exclude it from your site's build",
  "# triggers (Cloudflare Workers Builds: Settings → Build → Build watch paths), so",
  "# saving a draft doesn't rebuild the site.",
  '# Type: string. Default: "drafts".',
];

/** Index range [start, end) of the comment lines directly above `line` (no blank line between). */
function commentBlockAbove(lines: string[], line: number, stop: number): number {
  let start = line;
  while (start - 1 > stop && lines[start - 1]!.trim().startsWith("#")) start--;
  return start;
}

function migrateDrafts(lines: string[], changes: string[]): void {
  for (let h = 0; h < lines.length; h++) {
    const m = HEADER.exec(lines[h]!);
    if (!m || !/^(env\.[^.]+\.)?drafts$/.test(m[1]!)) continue;
    const table = `[${m[1]}]`;
    const blockEnd = () => {
      let e = h + 1;
      while (e < lines.length && !HEADER.test(lines[e]!)) e++;
      return e;
    };

    // [drafts] storage was removed in 0.10.0: drafts always live in the repository.
    const storage = lines.slice(h + 1, blockEnd()).findIndex((l) => /^\s*storage\s*=/.test(l));
    if (storage !== -1) {
      const at = h + 1 + storage;
      const from = commentBlockAbove(lines, at, h);
      const removeBlank = lines[at + 1]?.trim() === "" ? 1 : 0;
      lines.splice(from, at + 1 + removeBlank - from);
      changes.push(`${table}: removed "storage" (drafts are now always kept in the site repository)`);
    }

    // [drafts] repo_dir was renamed to dir in 0.10.0.
    const repoDir = lines.slice(h + 1, blockEnd()).findIndex((l) => /^\s*repo_dir\s*=/.test(l));
    if (repoDir !== -1) {
      const at = h + 1 + repoDir;
      const value = lines[at]!.slice(lines[at]!.indexOf("=") + 1).trim();
      const from = commentBlockAbove(lines, at, h);
      lines.splice(from, at + 1 - from, ...DIR_COMMENT, `dir = ${value}`);
      changes.push(`${table}: renamed "repo_dir" to "dir"`);
    }
  }

  // The old introduction above [drafts] described the removed options.
  for (let i = 0; i + OLD_DRAFTS_INTRO.length <= lines.length; i++) {
    if (OLD_DRAFTS_INTRO.every((l, k) => lines[i + k] === l)) {
      lines.splice(i, OLD_DRAFTS_INTRO.length, ...NEW_DRAFTS_INTRO);
      break;
    }
  }
}

// The [site] timezone option was removed: post dates are stored in UTC and shown in the browser's time zone.
function migrateTimezone(lines: string[], changes: string[]): void {
  for (let h = 0; h < lines.length; h++) {
    const m = HEADER.exec(lines[h]!);
    if (!m || !/^(env\.[^.]+\.)?site$/.test(m[1]!)) continue;
    let end = h + 1;
    while (end < lines.length && !HEADER.test(lines[end]!)) end++;
    const at = lines.slice(h + 1, end).findIndex((l) => /^\s*timezone\s*=/.test(l));
    if (at === -1) continue;
    const line = h + 1 + at;
    const from = commentBlockAbove(lines, line, h);
    const blank = lines[line + 1]?.trim() === "" && lines[from - 1]?.trim() === "" ? 1 : 0;
    lines.splice(from, line + 1 + blank - from);
    changes.push(`[${m[1]}]: removed "timezone" (dates are now stored in UTC and shown in each browser's time zone)`);
  }
}

interface SectionBlock {
  name: string;
  /** First line of the block: the banner comment above its header. */
  start: number;
  /** First header line of the section. */
  header: number;
}

/** Top-level sections (not `[env.*]`) with the comment banner above each, in file order. */
function sectionBlocks(lines: string[]): SectionBlock[] {
  const blocks: SectionBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = HEADER.exec(lines[i]!);
    if (!m) continue;
    const name = m[1]!.split(".")[0]!.trim();
    if (name === "env" || blocks.some((b) => b.name === name)) continue;
    blocks.push({ name, start: commentBlockAbove(lines, i, (blocks.at(-1)?.header ?? -1)), header: i });
  }
  return blocks;
}

/**
 * Sections of alasin.example.toml that the file doesn't have yet are added,
 * with their comments, where the example has them. Only optional sections can
 * be missing, and the example lists their defaults, so this documents new
 * options without changing what the configuration means.
 */
function addMissingSections(lines: string[], example: string, changes: string[]): void {
  const ex = example.split("\n");
  const exBlocks = sectionBlocks(ex);
  for (let k = 0; k < exBlocks.length; k++) {
    const block = exBlocks[k]!;
    const present = sectionBlocks(lines);
    if (present.some((b) => b.name === block.name)) continue;
    // The block's lines, up to the next banner (a section, or the [env.<name>]
    // introduction after the last one), without trailing blank lines.
    const banner = ex.findIndex((l, i) => i > block.header && /^# ─{10,}/.test(l));
    const end = Math.min(k + 1 < exBlocks.length ? exBlocks[k + 1]!.start : ex.length, banner === -1 ? ex.length : banner);
    const text = ex.slice(block.start, end);
    while (text.length && text.at(-1)!.trim() === "") text.pop();
    // Before the first later section the file has; otherwise after the last
    // section (before any [env.*] tables), separated by two blank lines.
    const later = exBlocks.slice(k + 1).map((b) => present.find((p) => p.name === b.name)).find(Boolean);
    if (later) {
      lines.splice(later.start, 0, ...text, "", "");
    } else {
      // The [env.*] part: its introduction banner, or else the first [env.*] table.
      const intro = lines.findIndex((l, i) => /^# ─{10,}/.test(l) && /^# \[env\./.test(lines[i + 1] ?? ""));
      const table = lines.findIndex((l) => /^\s*\[\[?\s*env\./.test(l));
      const env = intro !== -1 ? intro : table !== -1 ? commentBlockAbove(lines, table, -1) : -1;
      let at = env === -1 ? lines.length : env;
      while (at > 0 && lines[at - 1]!.trim() === "") at--;
      lines.splice(at, 0, "", "", ...text, ...(env === -1 ? [] : ["", ""]));
    }
    changes.push(`added [${block.name}] from alasin.example.toml (defaults; no change in behaviour)`);
  }
}

// [users] was removed: who can log in follows the site repository's
// collaborators on GitHub. The whole table goes, with its banner comment
// (also [env.<name>.users]).
function removeUsers(lines: string[], changes: string[]): void {
  for (let h = 0; h < lines.length; h++) {
    const m = HEADER.exec(lines[h]!);
    if (!m || !/^(env\.[^.]+\.)?users(\.allow)?$/.test(m[1]!.trim())) continue;
    let end = h + 1;
    while (end < lines.length && !HEADER.test(lines[end]!)) end++;
    // The comments above the next table belong to it.
    let keep = end;
    while (keep - 1 > h && lines[keep - 1]!.trim().startsWith("#")) keep--;
    while (keep - 1 > h && lines[keep - 1]!.trim() === "") keep--;
    const start = commentBlockAbove(lines, h, -1);
    lines.splice(start, keep - start);
    // The blank lines where the table was: two before a section's banner, one before anything else.
    let a = start;
    while (a > 0 && lines[a - 1]!.trim() === "") a--;
    let b = start;
    while (b < lines.length && lines[b]!.trim() === "") b++;
    const want = /^# ─/.test(lines[b] ?? "") ? 2 : 1;
    if (b - a > want) lines.splice(a + want, b - a - want);
    const table = m[1]!.trim().replace(/\.allow$/, "");
    if (!changes.some((c) => c.startsWith(`[${table}]`))) changes.push(`[${table}]: removed (who can log in now follows write access to the site repository)`);
    h = start - 1;
  }
}

/** A `key = value` line, or `# key = value` for an option that's commented out. */
const KEY_LINE = /^(#\s*)?([A-Za-z_][A-Za-z0-9_-]*)\s*=/;

interface ExampleOption {
  key: string;
  /** Its comments and the key line, as in the example. */
  lines: string[];
  commented: boolean;
}

/** The options of each top-level section of the example, in order. */
function exampleOptions(ex: string[]): Map<string, ExampleOption[]> {
  const out = new Map<string, ExampleOption[]>();
  let section: string | null = null;
  for (let i = 0; i < ex.length; i++) {
    const h = HEADER.exec(ex[i]!);
    if (h) {
      section = h[1]!.trim().startsWith("env") ? null : h[1]!.trim();
      if (section) out.set(section, out.get(section) ?? []);
      continue;
    }
    if (!section) continue;
    const m = KEY_LINE.exec(ex[i]!);
    if (!m) continue;
    // The comment lines right above it (not another commented-out option).
    let start = i;
    while (start > 0 && ex[start - 1]!.startsWith("#") && !KEY_LINE.test(ex[start - 1]!) && !/^# ─/.test(ex[start - 1]!)) start--;
    out.get(section)!.push({ key: m[2]!, lines: ex.slice(start, i + 1), commented: !!m[1] });
  }
  return out;
}

/**
 * Options of alasin.example.toml missing from a section the file already has
 * are added, with their comments, after the option before them in the
 * example. Commented-out options are always added; an active one only if the
 * configuration means exactly the same with it (its value is the default), so
 * required options with example values are never copied.
 */
function addMissingOptions(lines: string[], example: string, changes: string[], meaning: (text: string) => string | null): void {
  const options = exampleOptions(example.split("\n"));
  const before = meaning(lines.join("\n"));
  for (const [section, list] of options) {
    for (let k = 0; k < list.length; k++) {
      const option = list[k]!;
      // The section in the file (top-level, not [env.*]).
      const header = lines.findIndex((l) => HEADER.exec(l)?.[1]!.trim() === section && !l.trim().startsWith("[["));
      if (header === -1) continue;
      let end = header + 1;
      while (end < lines.length && !HEADER.test(lines[end]!)) end++;
      const keyAt = (key: string) => {
        for (let i = header + 1; i < end; i++) {
          const m = KEY_LINE.exec(lines[i]!.trimStart());
          if (m && m[2] === key) return i;
        }
        return -1;
      };
      if (keyAt(option.key) !== -1) continue;
      // After the option before it in the example that the file has, or after the header.
      let at = header + 1;
      for (let p = k - 1; p >= 0; p--) {
        const i = keyAt(list[p]!.key);
        if (i === -1) continue;
        at = i + 1;
        // A multi-line array value.
        let depth = (lines[i]!.match(/\[/g)?.length ?? 0) - (lines[i]!.match(/\]/g)?.length ?? 0);
        while (depth > 0 && at < end) {
          depth += (lines[at]!.match(/\[/g)?.length ?? 0) - (lines[at]!.match(/\]/g)?.length ?? 0);
          at++;
        }
        break;
      }
      // An option without comments of its own (sharing the one above, e.g. a
      // pair of commented-out lines) goes right under the one before it.
      const insert = option.lines.length === 1 && at > header + 1 && KEY_LINE.test(lines[at - 1]!.trimStart()) ? [...option.lines] : ["", ...option.lines];
      const next = [...lines.slice(0, at), ...insert, ...lines.slice(at)];
      if (!option.commented && (before === null || meaning(next.join("\n")) !== before)) continue;
      lines.splice(at, 0, ...insert);
      changes.push(`added ${option.commented ? "the commented-out option" : "the option"} [${section}] ${option.key} from alasin.example.toml (${option.commented ? "not set" : "its default"}; no change in behaviour)`);
    }
  }
}

/** The configuration a file means, for comparing; null if it isn't valid. */
function meaningOf(text: string): string | null {
  try {
    return JSON.stringify(parseConfig(selectEnvironment(parse(text) as Record<string, unknown>, undefined)));
  } catch {
    return null;
  }
}

export function migrateAlasinToml(text: string, example?: string): Migration {
  const lines = text.split("\n");
  const changes: string[] = [];
  migrateDrafts(lines, changes);
  migrateTimezone(lines, changes);
  removeUsers(lines, changes);
  if (example) {
    addMissingSections(lines, example, changes);
    addMissingOptions(lines, example, changes, meaningOf);
  }
  return { text: changes.length ? lines.join("\n") : text, changes };
}
