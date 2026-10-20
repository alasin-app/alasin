// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { isPage, wikiText } from "../../scripts/lib/wiki";

describe("isPage", () => {
  it("takes Markdown pages, the sidebar and the footer", () => {
    expect(["Home.md", "Users-and-Access.md", "_Sidebar.md", "_Footer.md"].every(isPage)).toBe(true);
  });

  it("leaves out everything else", () => {
    expect([".markdownlint.yaml", "notes.txt", "sub/Page.md", ".hidden.md"].some(isPage)).toBe(false);
  });
});

describe("wikiText", () => {
  it("drops .md from links to other pages, keeping anchors", () => {
    expect(wikiText("See [Updating](Updating.md) and [step 3](New-Site.md#3-create-the-token).")).toBe("See [Updating](Updating) and [step 3](New-Site#3-create-the-token).");
  });

  it("keeps addresses, paths and same-page anchors", () => {
    const text = "[a](https://github.com/o/r/blob/main/CONTRIBUTING.md) [b](../README.md) [c](#rotating-secrets) [d](docs/Page.md)";
    expect(wikiText(text)).toBe(text);
  });

  it("leaves code alone", () => {
    const text = "Write `[Updating](Updating.md)` like this:\n\n```md\n[Home](Home.md)\n```\n\nThen [Home](Home.md).";
    expect(wikiText(text)).toBe("Write `[Updating](Updating.md)` like this:\n\n```md\n[Home](Home.md)\n```\n\nThen [Home](Home).");
  });
});
