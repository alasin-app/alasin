// SPDX-License-Identifier: MIT
//
// Upgrades an alasin.toml written for an older Alasin version, so operators
// don't have to edit removed or renamed options by hand. Comments and all
// other lines are kept. Each migration says what it changed.

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

export function migrateAlasinToml(text: string, example?: string): Migration {
  const lines = text.split("\n");
  const changes: string[] = [];
  migrateDrafts(lines, changes);
  migrateTimezone(lines, changes);
  if (example) addMissingSections(lines, example, changes);
  return { text: changes.length ? lines.join("\n") : text, changes };
}
