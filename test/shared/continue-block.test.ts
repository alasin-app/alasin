// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { continueBlock } from "../../src/web/lib/continue-block";

const enter = (text: string, at = text.length) => continueBlock(text, at);

describe("Enter continues lists and quotes", () => {
  it("continues bullet lists", () => {
    expect(enter("- one")).toEqual({ text: "- one\n- ", cursor: 8 });
    expect(enter("* one")?.text).toBe("* one\n* ");
    expect(enter("  - nested")?.text).toBe("  - nested\n  - ");
  });

  it("numbers ordered lists", () => {
    expect(enter("1. one")?.text).toBe("1. one\n2. ");
    expect(enter("9) nine")?.text).toBe("9) nine\n10) ");
  });

  it("continues a quote on a new line that renders as its own line", () => {
    expect(enter("> quoted")).toEqual({ text: "> quoted  \n> ", cursor: 13 });
    expect(enter("> one two", 5)).toEqual({ text: "> one  \n> two", cursor: 10 });
  });

  it("ends a quote without leaving a line break or separator behind", () => {
    expect(enter("> a  \n> ")).toEqual({ text: "> a\n\n", cursor: 5 });
    expect(enter("> a  \n> \nmore", 8)).toEqual({ text: "> a\n\nmore", cursor: 4 });
    expect(enter("> a\n>\n> ")).toEqual({ text: "> a\n\n", cursor: 5 });
  });

  it("ends the list or quote on an empty item, with a blank line after it", () => {
    expect(enter("- one\n- ")).toEqual({ text: "- one\n\n", cursor: 7 });
    expect(enter("> a\n> ")).toEqual({ text: "> a\n\n", cursor: 5 });
    expect(enter("> a\n>\n> b")?.text).toBe("> a\n>\n> b  \n> ");
    expect(enter("- one\n- \nlater", 8)).toEqual({ text: "- one\n\nlater", cursor: 6 });
  });

  it("splits an item when Enter is pressed in the middle", () => {
    expect(enter("- one two", 5)).toEqual({ text: "- one\n-  two", cursor: 8 });
  });

  it("leaves ordinary lines and positions before the marker alone", () => {
    expect(enter("plain text")).toBeNull();
    expect(enter("- one", 1)).toBeNull();
    expect(enter("-not a list")).toBeNull();
  });
});
