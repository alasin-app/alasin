// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { removeEmptyItems } from "../../src/web/lib/markdown-cleanup";

describe("removing empty list items and quote lines on save", () => {
  it("removes empty items after a list", () => {
    expect(removeEmptyItems("- one\n- two\n-\n\nNext")).toBe("- one\n- two\n\nNext");
    expect(removeEmptyItems("1. one\n2.\n")).toBe("1. one\n");
    expect(removeEmptyItems("- one\n- \n")).toBe("- one\n");
  });

  it("removes a stray quote marker at the end of a quote", () => {
    expect(removeEmptyItems("> a\n> b\n>\n\nNext")).toBe("> a\n> b\n\nNext");
  });

  it("keeps a quote marker that separates paragraphs inside a quote", () => {
    const text = "> first paragraph\n>\n> second paragraph";
    expect(removeEmptyItems(text)).toBe(text);
  });

  it("keeps a dash under a paragraph line (a heading in Markdown)", () => {
    const text = "Heading\n-\n\nText";
    expect(removeEmptyItems(text)).toBe(text);
  });

  it("removes a lone empty item between blank lines without leaving extra blank lines", () => {
    expect(removeEmptyItems("Text\n\n-\n\nMore")).toBe("Text\n\nMore");
    expect(removeEmptyItems("Text\n\n>\n\nMore")).toBe("Text\n\nMore");
  });

  it("never changes code blocks", () => {
    const text = "```\n-\n>\n```\n\n~~~\n1.\n~~~";
    expect(removeEmptyItems(text)).toBe(text);
  });

  it("leaves other text alone", () => {
    const text = "## Title\n\n**bold** and - dash\n\n---\n\n{{< gallery >}}\n\n![](/a.jpg)\n\n{{< /gallery >}}\n";
    expect(removeEmptyItems(text)).toBe(text);
  });
});
