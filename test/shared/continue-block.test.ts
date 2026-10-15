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

  it("continues quotes", () => {
    expect(enter("> quoted")?.text).toBe("> quoted\n> ");
  });

  it("ends the list on an empty item", () => {
    expect(enter("- one\n- ")).toEqual({ text: "- one\n", cursor: 6 });
    expect(enter("> a\n> ")).toEqual({ text: "> a\n", cursor: 4 });
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
