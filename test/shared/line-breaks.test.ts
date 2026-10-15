// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { dropDanglingBreaks, isQuoted, keepLineBreaks, quoteLines, richEnter, unquoteLines } from "../../src/web/lib/line-breaks";

const POEM = "Line one,\nline two.\n\nLine three,\nline four.\n\n-- Unknown";

describe("line breaks without Shift+Enter", () => {
  it("quotes a poem like the site's existing quotes", () => {
    expect(quoteLines(POEM.split("\n")).join("\n")).toBe(
      "> Line one,  \n> line two.\n>\n> Line three,  \n> line four.\n>\n> -- Unknown",
    );
  });

  it("unquotes it again, keeping the line breaks", () => {
    const quoted = quoteLines(POEM.split("\n"));
    expect(isQuoted(quoted)).toBe(true);
    expect(unquoteLines(quoted).join("\n")).toBe("Line one,  \nline two.\n\nLine three,  \nline four.\n\n-- Unknown");
    expect(isQuoted(POEM.split("\n"))).toBe(false);
  });

  it("keeps the line breaks of pasted text, but not around Markdown structure", () => {
    expect(keepLineBreaks(POEM)).toBe("Line one,  \nline two.\n\nLine three,  \nline four.\n\n-- Unknown");
    expect(keepLineBreaks("## Title\ntext\n- a\n- b\n| x |\n| y |")).toBe("## Title\ntext\n- a\n- b\n| x |\n| y |");
    expect(keepLineBreaks("```\ncode\nmore\n```")).toBe("```\ncode\nmore\n```");
    expect(keepLineBreaks("a\r\nb")).toBe("a  \nb");
  });

  it("makes Enter in a paragraph a line break, and Enter on the empty line a paragraph end", () => {
    const first = richEnter("Line one,", 9)!;
    expect(first).toEqual({ text: "Line one,  \n", cursor: 12 });
    expect(richEnter(first.text, first.cursor)).toEqual({ text: "Line one,\n\n", cursor: 11 });
    expect(richEnter("one two", 3)).toEqual({ text: "one  \ntwo", cursor: 6 });
  });

  it("leaves headings, code, tables, shortcodes and line starts to a plain new line", () => {
    expect(richEnter("## Title", 8)).toBeNull();
    expect(richEnter("```\ncode", 8)).toBeNull();
    expect(richEnter("| a |", 5)).toBeNull();
    expect(richEnter("{{< youtube x >}}", 17)).toBeNull();
    expect(richEnter("text", 0)).toBeNull();
  });

  it("still continues lists and quotes", () => {
    expect(richEnter("- one", 5)?.text).toBe("- one\n- ");
    expect(richEnter("> q", 3)?.text).toBe("> q  \n> ");
  });

  it("drops line breaks with nothing after them on save", () => {
    expect(dropDanglingBreaks("a  \nb  \n\nc  ")).toBe("a  \nb\n\nc");
    expect(dropDanglingBreaks("```\nx  \n\n```")).toBe("```\nx  \n\n```");
  });
});
