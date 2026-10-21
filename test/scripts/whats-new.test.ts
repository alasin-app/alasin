// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { pullRequests, releaseDate, whatsNewLines, writeSection } from "../../scripts/lib/whats-new";

describe("pullRequests", () => {
  it("takes squash-merged pull requests, not release commits", () => {
    expect(pullRequests(["feat(web): a link (#366)", "chore(main): release 1.9.0 (#368)", "fix: no number", "feat(scripts): screenshots (#365)", "feat(web): a link (#366)"])).toEqual([366, 365]);
  });
});

describe("whatsNewLines", () => {
  const body = (section: string) => `Closes #1\n\n## What changes\n\nStuff.\n\n## What's New\n\n<!-- Plain words. -->\n\n${section}\n\n## Documentation\n\nnone\n`;

  it("reads list items, joining their continuation lines", () => {
    expect(whatsNewLines(body("- **One.** First\n  line.\n- **Two.** Second."))).toEqual(["- **One.** First line.", "- **Two.** Second."]);
  });
  it("makes a paragraph an item", () => {
    expect(whatsNewLines(body("**Alasin's website at hand:** a link."))).toEqual(["- **Alasin's website at hand:** a link."]);
  });
  it("is empty for none, nothing, or no section", () => {
    expect(whatsNewLines(body("none"))).toEqual([]);
    expect(whatsNewLines(body("None: internal only."))).toEqual([]);
    expect(whatsNewLines(body(""))).toEqual([]);
    expect(whatsNewLines(body("None of your drafts are lost."))).toEqual(["- None of your drafts are lost."]);
    expect(whatsNewLines("Closes #1\n\n## Documentation\n\nnone")).toEqual([]);
  });
  it("leaves out comments, also one made of another's pieces", () => {
    expect(whatsNewLines("## What's New\n\n<!<!-- x -->-- y -->\n- A thing.\n")).toEqual(["- A thing."]);
  });
  it("reads a last section, without the attribution line", () => {
    expect(whatsNewLines("## What's New\n\n- A thing.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n")).toEqual(["- A thing."]);
  });
});

describe("releaseDate", () => {
  it("is written out", () => expect(releaseDate("2026-10-21")).toBe("21 October 2026"));
});

describe("writeSection", () => {
  const page = "Intro.\n\n## 1.8.0 (20 October 2026)\n\n- Old.\n\n## 1.7.0 (19 October 2026)\n\n- Older.\n";

  it("adds the version newest first", () => {
    expect(writeSection(page, "1.9.0", "2026-10-21", ["- New."])).toBe(
      "Intro.\n\n## 1.9.0 (21 October 2026)\n\n- New.\n\n## 1.8.0 (20 October 2026)\n\n- Old.\n\n## 1.7.0 (19 October 2026)\n\n- Older.\n",
    );
  });
  it("replaces the version's section, keeping the others", () => {
    const once = writeSection(page, "1.9.0", "2026-10-21", ["- New."]);
    expect(writeSection(once, "1.9.0", "2026-10-22", ["- Newer."])).toBe(writeSection(page, "1.9.0", "2026-10-22", ["- Newer."]));
  });
  it("leaves the version out without lines", () => {
    expect(writeSection(writeSection(page, "1.9.0", "2026-10-21", ["- New."]), "1.9.0", "2026-10-21", [])).toBe(page);
  });
});
