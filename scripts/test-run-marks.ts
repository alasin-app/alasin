// SPDX-License-Identifier: MIT
//
// npm run test-run-marks
//
// Marks failed and fixed checks in the open test runs (issues labelled
// test-run) from their sub-issues: a bug whose title starts with a check ID
// ("4.19: …") puts "❌ #123" on that check, and "✅ #123 fixed, re-test" once
// it's closed. Run by the test-run-marks workflow; changes a run only when its
// marks are out of date. Needs the GitHub CLI (gh) with a token that can edit
// issues (GH_TOKEN in Actions).

import { execFileSync } from "node:child_process";
import { markRun, normalizedRun, type SubIssue } from "./lib/test-run";

const gh = (args: string[], input?: string) => execFileSync("gh", args, { encoding: "utf8", input });

const runs = JSON.parse(gh(["issue", "list", "--label", "test-run", "--state", "open", "--limit", "50", "--json", "number,body"])) as { number: number; body: string }[];
for (const run of runs) {
  const subs = JSON.parse(gh(["api", "--paginate", "--slurp", `repos/{owner}/{repo}/issues/${run.number}/sub_issues`])) as {
    number: number;
    title: string;
    state: "open" | "closed";
    state_reason?: string | null;
  }[][];
  const bugs: SubIssue[] = subs.flat().map((s) => ({ number: s.number, title: s.title, state: s.state, stateReason: s.state_reason }));
  const marked = markRun(run.body, bugs);
  if (marked === normalizedRun(run.body)) continue;
  gh(["issue", "edit", String(run.number), "--body-file", "-"], `${marked}\n`);
  console.log(`#${run.number}: marks updated (${bugs.length} sub-issues)`);
}
