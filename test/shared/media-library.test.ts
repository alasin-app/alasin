// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { groupImages } from "../../src/shared/media-library";

describe("groupImages", () => {
  it("hides variants, uses the smallest as thumbnail, newest day first", () => {
    expect(
      groupImages(["2026/10/01/a-960.webp", "2026/10/01/a-480.webp", "2026/10/01/a.jpg", "2026/10/16/b.png", "2026/10/16/a.jpg", "2026/10/16/route-66.jpg"]),
    ).toEqual([
      { key: "2026/10/16/a.jpg", thumb: "2026/10/16/a.jpg" },
      { key: "2026/10/16/b.png", thumb: "2026/10/16/b.png" },
      { key: "2026/10/16/route-66.jpg", thumb: "2026/10/16/route-66.jpg" },
      { key: "2026/10/01/a.jpg", thumb: "2026/10/01/a-480.webp" },
    ]);
  });
});
