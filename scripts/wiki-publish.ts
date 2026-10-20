// SPDX-License-Identifier: MIT
//
// npm run wiki:publish [-- --dry-run]
//
// Publishes wiki/ as the repository's GitHub wiki: clones the wiki's own git
// repository, replaces its pages with wiki/'s (links between pages without
// their .md; pages no longer in wiki/ are deleted), commits and pushes. Takes
// wiki/ as committed, so the wiki's commit names the commit it came from.
// --dry-run shows what would change and pushes nothing.
//
// The wiki's repository exists only once its first page has been saved in the
// browser (the repository's Wiki tab → Create the first page → Save).

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "./lib/args";
import { isPage, wikiText } from "./lib/wiki";

const dryRun = process.argv.includes("--dry-run");
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();

const source = join(repoRoot, "wiki");
if (git(repoRoot, "status", "--porcelain", "--", "wiki")) throw new Error("wiki/ has uncommitted changes: commit them first, so the wiki names the commit it came from.");
const commit = git(repoRoot, "rev-parse", "--short", "HEAD");
const branch = git(repoRoot, "rev-parse", "--abbrev-ref", "HEAD");
const url = git(repoRoot, "remote", "get-url", "origin").replace(/(\.git)?\/?$/, ".wiki.git");

const dir = mkdtempSync(join(tmpdir(), "alasin-wiki-"));
try {
  if (spawnSync("git", ["clone", "--quiet", "--depth", "1", url, dir], { stdio: ["ignore", "inherit", "pipe"] }).status !== 0) {
    throw new Error(`Can't clone ${url}. If the wiki has no pages yet, create the first one in the browser (the repository's Wiki tab → Create the first page → Save), then run this again.`);
  }
  for (const name of readdirSync(dir)) if (isPage(name)) rmSync(join(dir, name));
  const pages = readdirSync(source).filter(isPage);
  for (const name of pages) writeFileSync(join(dir, name), wikiText(readFileSync(join(source, name), "utf8")));
  git(dir, "add", "--all");

  const changes = git(dir, "diff", "--cached", "--stat");
  if (!changes) {
    console.log(`The wiki already has wiki/ as of ${commit} (${pages.length} pages).`);
  } else {
    console.log(changes);
    if (dryRun) {
      console.log("\n--dry-run: nothing pushed.");
    } else {
      git(dir, "commit", "--quiet", "--message", `Publish wiki/ from ${branch} at ${commit}`);
      git(dir, "push", "--quiet");
      console.log(`\nPublished ${pages.length} pages from ${branch} at ${commit}.`);
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
