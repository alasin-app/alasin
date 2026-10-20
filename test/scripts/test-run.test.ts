// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { checkIdOf, checksInPr, markRun, normalizedRun, parseChecks, runBody } from "../../scripts/lib/test-run";
import template from "../../.github/ISSUE_TEMPLATE/test-run.md?raw";

const TEMPLATE = `---
name: Manual test run
---

## Editor

- [ ] **2.1 New draft**: *New post* -> save
- [ ] **2.21 Details sheet**: the sheet opens

## Authors

Posts have author_id.

- [ ] **A.1 New draft**: author and author_id written
`;

describe("manual test runs", () => {
  it("reads the checks and their areas from the template", () => {
    expect(parseChecks(TEMPLATE).map((c) => `${c.area}:${c.id}`)).toEqual(["Editor:2.1", "Editor:2.21", "Authors:A.1"]);
  });

  it("the real template has unique check IDs, each under an area", () => {
    const ids = parseChecks(template).map((c) => c.id);
    expect(ids.length).toBeGreaterThan(50);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("takes the check IDs a pull request lists under Manual checks, ignoring comments and other sections", () => {
    const body = "Closes #5\n\n## Manual checks\n\n<!-- e.g. 9.9 -->\n- 2.21 (changed), A.1\n- new: A.1\n\n## Notes\n\nSee 3.1 later.\n";
    expect(checksInPr(body)).toEqual(["2.21", "A.1"]);
    expect(checksInPr("## Manual checks\r\n\r\nnone\r\n")).toEqual([]);
    expect(checksInPr("No section here, 2.1")).toEqual([]);
    // Removing the inner comment leaves another one, which goes too.
    expect(checksInPr("## Manual checks\n\n<!<!-- x -->-- 9.9 -->\n- 2.21\n")).toEqual(["2.21"]);
  });

  it("builds a run with the affected checks in the template's order and areas", () => {
    const prs = [
      { number: 7, title: "feat: authors", body: "## Manual checks\n\nA.1, 2.21" },
      { number: 8, title: "chore: deps", body: "## Manual checks\n\nnone" },
    ];
    const { body, ids, unknown } = runBody(parseChecks(TEMPLATE), prs, ["Z.9"]);
    expect(ids).toEqual(["2.21", "A.1"]);
    expect(unknown).toEqual(["Z.9"]);
    expect(body).toContain("- #7 feat: authors\n- #8 chore: deps (no manual checks)");
    expect(body).toContain("## Editor\n\n- [ ] **2.21 Details sheet**: the sheet opens\n\n## Authors\n\n- [ ] **A.1 New draft**");
    expect(body).not.toContain("2.1 New draft");
  });
});

describe("bug marks in test runs", () => {
  const RUN = "## Editor\n\n- [ ] **2.21 Details sheet**: the sheet opens\n- [x] **2.22 Author**: author written\n\n## Authors\n\n- [ ] **A.1 New draft**: written";
  const bug = (number: number, title: string, state: "open" | "closed" = "open", stateReason: string | null = null) => ({ number, title, state, stateReason });

  it("reads the check ID a bug's title starts with", () => {
    expect(checkIdOf("4.19: lock banner missing")).toBe("4.19");
    expect(checkIdOf("[Bug]: A.3 name not updated")).toBe("A.3");
    expect(checkIdOf("Lock banner, see 4.19")).toBeNull();
    expect(checkIdOf("1.0.0 broke something")).toBe("1.0");
  });

  it("marks an open bug on its check, keeping the checkbox", () => {
    const out = markRun(RUN, [bug(301, "2.21: sheet doesn't open")]);
    expect(out).toContain("- [ ] **2.21 Details sheet**: the sheet opens ❌ #301");
    expect(out).toContain("- [x] **2.22 Author**: author written\n");
  });

  it("turns the mark green when the bug is closed, and drops it when closed as not planned", () => {
    const open = markRun(RUN, [bug(301, "2.21: x")]);
    expect(markRun(open, [bug(301, "2.21: x", "closed", "completed")])).toContain("the sheet opens ✅ #301 fixed, re-test");
    expect(markRun(open, [bug(301, "2.21: x", "closed", "not_planned")])).toContain("the sheet opens\n");
  });

  it("replaces marks typed by hand, and doesn't confuse #30 with #301", () => {
    const typed = RUN.replace("the sheet opens", 'the sheet opens "❌ #301" ❌ #30');
    expect(markRun(typed, [bug(301, "2.21: x", "closed", "completed")])).toContain("the sheet opens ❌ #30 ✅ #301 fixed, re-test");
  });

  it("lists bugs without a check of the run at the end, and rebuilds that list", () => {
    const out = markRun(RUN, [bug(302, "Crash on start"), bug(303, "9.9: unknown check")]);
    expect(out.endsWith("## Bugs without a check\n\n- ❌ #302\n- ❌ #303")).toBe(true);
    expect(markRun(out, [bug(302, "Crash on start", "closed", "completed")]).endsWith("## Bugs without a check\n\n- ✅ #302 fixed, re-test")).toBe(true);
    expect(markRun(out, [])).toBe(RUN);
  });

  it("changes nothing when the marks are already right, whatever the line ends", () => {
    const bugs = [bug(301, "2.21: x"), bug(304, "A.1: y", "closed", "completed"), bug(305, "no id")];
    const once = markRun(RUN, bugs);
    expect(markRun(once, bugs)).toBe(once);
    expect(markRun(once.replace(/\n/g, "\r\n") + "\r\n", bugs)).toBe(normalizedRun(once));
  });
});
