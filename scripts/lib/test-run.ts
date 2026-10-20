// SPDX-License-Identifier: MIT
//
// Manual test runs: the checks are kept in .github/ISSUE_TEMPLATE/test-run.md,
// grouped by area; each pull request lists the IDs of the checks it affects
// under "## Manual checks". A run tests those of the pull requests merged
// since the last run.

export interface Check {
  id: string;
  area: string;
  /** The task list line, as in the template. */
  line: string;
}

const CHECK_LINE = /^- \[ \] \*\*([0-9A-Z]+\.[0-9]+) /;

/** The checks of the template, in order, with their areas (the `## ` headings). */
export function parseChecks(template: string): Check[] {
  const checks: Check[] = [];
  let area = "";
  for (const line of template.split("\n")) {
    const heading = /^## (.+)$/.exec(line);
    if (heading) area = heading[1]!.trim();
    const m = CHECK_LINE.exec(line);
    if (m && area) checks.push({ id: m[1]!, area, line });
  }
  return checks;
}

/** The check IDs a pull request lists under its "## Manual checks" heading. */
export function checksInPr(body: string): string[] {
  const m = /^##+ Manual checks[^\n]*\n([\s\S]*?)(?=^##+ |(?![\s\S]))/m.exec(body.replace(/\r\n/g, "\n"));
  if (!m) return [];
  // Until none is left: removing one comment can join the pieces of another.
  let text = m[1]!;
  for (let prev = ""; prev !== text; ) {
    prev = text;
    text = text.replace(/<!--[\s\S]*?-->/g, "");
  }
  return [...new Set([...text.matchAll(/\b([0-9]+|[A-Z])\.[0-9]+\b/g)].map((x) => x[0]))];
}

export interface MergedPr {
  number: number;
  title: string;
  body: string;
}

/**
 * The body of a test run issue: the pull requests it covers and the checks
 * they affect, in the template's order and areas. IDs that aren't in the
 * template are listed so they can be fixed.
 */
/** Where runs are done: the test site, deployed from dev, on these devices. */
export const RUN_DEPLOYMENT = "https://app.dev.alasin.app (the test site, deployed from `dev` by CI)";
export const RUN_DEVICES = "iOS Safari, macOS Chrome";

/** A run's title: the dev commit under test, and the release it comes after. */
export const runTitle = (commit: string, lastRelease: string) => `Test run: dev at ${commit} (after ${lastRelease})`;

export function runBody(checks: Check[], prs: MergedPr[], extra: string[] = [], version = "(shown in the account sheet)"): { body: string; ids: string[]; unknown: string[] } {
  const wanted = new Set([...prs.flatMap((p) => checksInPr(p.body)), ...extra]);
  const known = new Set(checks.map((c) => c.id));
  const unknown = [...wanted].filter((id) => !known.has(id));
  const chosen = checks.filter((c) => wanted.has(c.id));
  const out = [
    `- **Version:** ${version}`,
    `- **Deployment:** ${RUN_DEPLOYMENT}`,
    `- **Devices:** ${RUN_DEVICES}`,
    "",
    'Tick a check when it passes. For a failure, add a sub-issue (*Sub-issues* → *Create sub-issue*) whose title starts with the check ID, e.g. "4.19: lock banner missing on iOS": the check gets "❌ #123", and "✅ #123 fixed, re-test" once the bug is closed. Tick the check when the re-test passes.',
    "",
    "## Changes",
    "",
    ...(prs.length ? prs.map((p) => `- #${p.number} ${p.title}${checksInPr(p.body).length ? "" : " (no manual checks)"}`) : ["- (none listed)"]),
  ];
  let area = "";
  for (const c of chosen) {
    if (c.area !== area) out.push("", `## ${(area = c.area)}`, "");
    out.push(c.line);
  }
  if (!chosen.length) out.push("", "No manual checks: nothing to test by hand.");
  return { body: `${out.join("\n")}\n`, ids: chosen.map((c) => c.id), unknown };
}

/** A sub-issue of a test run: a bug found while testing. */
export interface SubIssue {
  number: number;
  title: string;
  state: "open" | "closed";
  /** Why it was closed: "completed" (fixed) or "not_planned". */
  stateReason?: string | null;
}

/** The check a bug is about: the ID its title starts with (after an optional "[Bug]: "), e.g. "4.19: …". */
export function checkIdOf(title: string): string | null {
  const m = /^\s*(?:\[[^\]]*\]:?\s*)?(\d+|[A-Z])\.(\d+)\b/.exec(title);
  return m ? `${m[1]}.${m[2]}` : null;
}

const UNLINKED = "## Bugs without a check";

/**
 * The run's text with each bug marked on its check: "❌ #123" while it's
 * open, "✅ #123 fixed, re-test" once closed as completed, nothing if closed
 * as not planned. Checkboxes are left as they are. Bugs whose title names no
 * check of the run are listed at the end. Marking again changes nothing.
 */
export function markRun(body: string, bugs: SubIssue[]): string {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  // The section is rebuilt below.
  const section = lines.indexOf(UNLINKED);
  if (section !== -1) {
    let end = section + 1;
    while (end < lines.length && !lines[end]!.startsWith("## ")) end++;
    lines.splice(section, end - section);
    while (lines.length && lines.at(-1)!.trim() === "") lines.pop();
  }
  const unlinked: string[] = [];
  for (const bug of bugs) {
    // Earlier marks of this bug (also as typed by hand, in quotes) go first.
    const old = new RegExp(`\\s*"?(?:❌|✅) #${bug.number}(?!\\d)(?: fixed, re-test)?"?`, "g");
    for (let i = 0; i < lines.length; i++) if (CHECK_LINE_ANY.test(lines[i]!)) lines[i] = lines[i]!.replace(old, "");
    const fixed = bug.state === "closed";
    if (fixed && bug.stateReason === "not_planned") continue;
    const id = checkIdOf(bug.title);
    const at = id ? lines.findIndex((l) => l.startsWith(`- [ ] **${id} `) || l.startsWith(`- [x] **${id} `) || l.startsWith(`- [X] **${id} `)) : -1;
    if (at === -1) {
      unlinked.push(`- ${fixed ? "✅" : "❌"} #${bug.number}${fixed ? " fixed, re-test" : ""}`);
      continue;
    }
    lines[at] = `${lines[at]!.trimEnd()} ${fixed ? `✅ #${bug.number} fixed, re-test` : `❌ #${bug.number}`}`;
  }
  if (unlinked.length) lines.push("", UNLINKED, "", ...unlinked);
  return lines.join("\n").trimEnd();
}

/** A run's text as compared: GitHub keeps what the browser sent, often with \r\n line ends. */
export const normalizedRun = (body: string) => body.replace(/\r\n/g, "\n").trimEnd();

const CHECK_LINE_ANY = /^- \[[ xX]\] \*\*/;
