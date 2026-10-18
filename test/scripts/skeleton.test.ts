// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { fillPlaceholders, unfilled, type SkeletonValues } from "../../scripts/lib/skeleton";

const values: SkeletonValues = {
  SITE_URL: "https://www.example.com",
  SITE_TITLE: 'The "Example" site',
  LANGUAGE: "en",
  MEDIA_URL: "https://media.example.com/",
  SITE_WORKER: "example-com",
  MODULE_PATH: "github.com/octocat/example.com",
};

describe("skeleton placeholders", () => {
  it("fills every placeholder, escaping quotes for TOML and JSON strings", () => {
    const toml = 'baseURL = "__SITE_URL__/"\ntitle = "__SITE_TITLE__"\nmediaURL = "__MEDIA_URL__"\n';
    expect(fillPlaceholders(toml, values)).toBe('baseURL = "https://www.example.com/"\ntitle = "The \\"Example\\" site"\nmediaURL = "https://media.example.com/"\n');
    expect(unfilled(fillPlaceholders(toml, values))).toEqual([]);
  });

  it("refuses a placeholder it has no value for, and leaves Hugo templates alone", () => {
    expect(() => fillPlaceholders("x = __NOPE__", values)).toThrow("No value for __NOPE__");
    expect(fillPlaceholders("{{ .Title }} {{< gallery >}}", values)).toBe("{{ .Title }} {{< gallery >}}");
    expect(unfilled("module __MODULE_PATH__\n__SITE_URL__ __SITE_URL__")).toEqual(["__MODULE_PATH__", "__SITE_URL__"]);
  });
});
