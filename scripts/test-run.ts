// SPDX-License-Identifier: MIT
//
// npm run test-run [-- --since <date|tag>] [--checks 2.21,A.3] [--create]
//
// Builds a manual test run from the pull requests merged into dev since the
// last test run issue was opened (or since --since): the checks each one
// lists under "## Manual checks", taken from .github/ISSUE_TEMPLATE/test-run.md.
// --checks adds checks by ID. Prints the issue; --create opens it on GitHub
// (labelled test-run). Needs the GitHub CLI (gh), logged in.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type MergedPr, parseChecks, runBody, runTitle } from "./lib/test-run";

const root = join(import.meta.dirname, "..");
const args = process.argv.slice(2).filter((a) => a !== "--");
const option = (name: string) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const gh = (...a: string[]) => execFileSync("gh", a, { cwd: root, encoding: "utf8" });

/** When the last run was opened, or when the given tag was made. */
function since(): string {
  const given = option("--since");
  if (given && /^\d{4}-\d{2}-\d{2}/.test(given)) return given;
  if (given) return gh("api", `repos/{owner}/{repo}/commits/${given}`, "--jq", ".commit.committer.date").trim();
  const last = gh("issue", "list", "--label", "test-run", "--state", "all", "--limit", "1", "--json", "createdAt", "--jq", ".[0].createdAt").trim();
  if (!last) throw new Error("No earlier test run: give --since <date or tag>.");
  return last;
}

const from = since();
const prs = (JSON.parse(gh("pr", "list", "--base", "dev", "--state", "merged", "--search", `merged:>=${from}`, "--limit", "200", "--json", "number,title,body")) as MergedPr[])
  // Merges of main back into dev bring no changes of their own.
  .filter((p) => !/^chore: merge main back into dev/.test(p.title))
  .sort((a, b) => a.number - b.number);
const checks = parseChecks(readFileSync(join(root, ".github/ISSUE_TEMPLATE/test-run.md"), "utf8"));
const extra = (option("--checks") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
// The dev commit under test, and the release it comes after.
const commit = execFileSync("git", ["rev-parse", "--short", "origin/dev"], { cwd: root, encoding: "utf8" }).trim();
const release = `v${(JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string }).version}`;
const { body, ids, unknown } = runBody(checks, prs, extra, `\`dev\` at ${commit} (the next release after ${release})`);
const title = runTitle(commit, release);

if (unknown.length) console.error(`Not in the template (check the IDs): ${unknown.join(", ")}`);
console.error(`${prs.length} pull requests merged since ${from}; ${ids.length} checks.`);
if (args.includes("--create")) {
  const url = execFileSync("gh", ["issue", "create", "--label", "test-run", "--title", title, "--body-file", "-"], { cwd: root, encoding: "utf8", input: body }).trim();
  console.log(url);
} else {
  console.log(`# ${title}\n\n${body}`);
}
