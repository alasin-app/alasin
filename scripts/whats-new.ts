// SPDX-License-Identifier: MIT
//
// npm run whats-new [-- --version <x.y.z>] [--date yyyy-mm-dd] [--since <tag>] [--dry-run]
//
// Writes the version's section of wiki/What's-New.md (#370): the "## What's
// New" sections of the pull requests merged since the last release tag
// (--since, default the newest v* tag), newest first, dated --date (default
// today). The version defaults to package.json's, so on a release PR's branch
// it's the one being released. The release workflow runs it on every update
// of the release PR. Needs `gh` (GH_TOKEN in CI). --dry-run prints the section.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./lib/args";
import { pullRequests, whatsNewLines, writeSection } from "./lib/whats-new";

const argv = process.argv.slice(2).filter((a) => a !== "--");
const option = (name: string, fallback: () => string) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback() : argv[i + 1]!;
};
const run = (cmd: string, ...a: string[]) => execFileSync(cmd, a, { cwd: repoRoot, encoding: "utf8" }).trim();

const version = option("--version", () => (JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { version: string }).version);
const date = option("--date", () => new Date().toISOString().slice(0, 10));
const since = option("--since", () => run("git", "describe", "--tags", "--abbrev=0", "--match", "v*", "HEAD"));
const page = join(repoRoot, "wiki", "What's-New.md");

const subjects = run("git", "log", "--no-merges", "--format=%s", `${since}..HEAD`).split("\n").filter(Boolean);
const lines: string[] = [];
for (const n of pullRequests(subjects)) {
  const pr = JSON.parse(run("gh", "pr", "view", String(n), "--json", "body,title")) as { body: string; title: string };
  const found = whatsNewLines(pr.body);
  console.log(`#${n} ${pr.title}: ${found.length ? `${found.length} line(s)` : "none"}`);
  lines.push(...found);
}

const before = readFileSync(page, "utf8");
const after = writeSection(before, version, date, lines);
if (argv.includes("--dry-run")) {
  console.log(lines.length ? `\n## ${version}\n\n${lines.join("\n")}` : `\nNo What's New lines for ${version}.`);
} else if (after !== before) {
  writeFileSync(page, after);
  console.log(`wiki/What's-New.md: ${lines.length ? `${version} with ${lines.length} line(s)` : `no section for ${version}`}`);
} else {
  console.log("wiki/What's-New.md: unchanged");
}
