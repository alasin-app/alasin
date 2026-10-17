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
  const text = m[1]!.replace(/<!--[\s\S]*?-->/g, "");
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
export function runBody(checks: Check[], prs: MergedPr[], extra: string[] = []): { body: string; ids: string[]; unknown: string[] } {
  const wanted = new Set([...prs.flatMap((p) => checksInPr(p.body)), ...extra]);
  const known = new Set(checks.map((c) => c.id));
  const unknown = [...wanted].filter((id) => !known.has(id));
  const chosen = checks.filter((c) => wanted.has(c.id));
  const out = [
    "- **Version:** (shown in the account sheet)",
    "- **Deployment:** (dev or production)",
    "- **Devices:** (e.g. iOS Safari, macOS Chrome)",
    "",
    'Tick a check when it passes. For a failure, open a bug issue and link it after the check ("❌ #123"); tick the check once the fix has been checked.',
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
