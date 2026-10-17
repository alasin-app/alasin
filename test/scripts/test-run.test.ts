// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { checksInPr, parseChecks, runBody } from "../../scripts/lib/test-run";
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
