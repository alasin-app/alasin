// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { poll } from "../../scripts/lib/poll";

describe("poll", () => {
  it("returns at once when the first result is done", async () => {
    let calls = 0;
    expect(await poll(async () => ++calls, () => true, { delayMs: 0 })).toBe(1);
    expect(calls).toBe(1);
  });

  it("checks again until the result is done", async () => {
    let calls = 0;
    expect(await poll(async () => ++calls, (n) => n === 3, { delayMs: 0 })).toBe(3);
  });

  it("gives up after the given tries and returns the last result", async () => {
    let calls = 0;
    expect(await poll(async () => ++calls, () => false, { tries: 4, delayMs: 0 })).toBe(4);
  });
});
