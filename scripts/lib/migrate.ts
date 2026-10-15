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

export function migrateAlasinToml(text: string): Migration {
  const lines = text.split("\n");
  const changes: string[] = [];
  migrateDrafts(lines, changes);
  migrateTimezone(lines, changes);
  return { text: changes.length ? lines.join("\n") : text, changes };
}
