// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { normalizeUrl, urlProblem } from "../../scripts/lib/urls";

describe("setup URL answers", () => {
  it("accepts a bare hostname and adds https://", () => {
    expect(normalizeUrl("alasin.example.com")).toBe("https://alasin.example.com");
    expect(normalizeUrl("  media.example.com/  ")).toBe("https://media.example.com/");
    expect(normalizeUrl("https://alasin.example.com")).toBe("https://alasin.example.com");
    expect(urlProblem("alasin.example.com", { originOnly: true })).toBeNull();
    expect(urlProblem("https://alasin.example.com/", { originOnly: true })).toBeNull();
  });

  it("rejects http, paths for origins, and incomplete hostnames", () => {
    expect(urlProblem("http://alasin.example.com", { originOnly: true })).toMatch(/https/);
    expect(urlProblem("alasin.example.com/app", { originOnly: true })).toMatch(/without a path/);
    expect(urlProblem("www.example.com/blog/", { originOnly: false })).toBeNull();
    expect(urlProblem("alasin", { originOnly: true })).toMatch(/full hostname/);
    expect(urlProblem("not a url", { originOnly: false })).not.toBeNull();
  });
});
