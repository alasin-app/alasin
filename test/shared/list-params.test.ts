// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { isReturnPath, listSearch, parseListParams } from "../../src/web/lib/list-params";

describe("list params", () => {
  it("reads an empty query as everything, newest first", () => {
    expect(parseListParams("")).toEqual({ state: "all", categories: [], authors: [], tags: [], sort: "newest", query: "" });
  });

  it("reads every part, with repeated values once each", () => {
    expect(parseListParams("?state=draft&category=travel&category=food&category=travel&author=octocat&tag=winter&sort=oldest&q=bergen")).toEqual({
      state: "draft",
      categories: ["travel", "food"],
      authors: ["octocat"],
      tags: ["winter"],
      sort: "oldest",
      query: "bergen",
    });
  });

  it("ignores unknown values", () => {
    expect(parseListParams("?state=bin&sort=random&tag=").state).toBe("all");
    expect(parseListParams("?sort=random").sort).toBe("newest");
    expect(parseListParams("?tag=").tags).toEqual([]);
  });

  it("writes nothing for the defaults, and reads back what it writes", () => {
    expect(listSearch(parseListParams(""))).toBe("");
    const list = parseListParams("?state=archived&category=a%20b&tag=%C3%A4&sort=oldest&q=x%26y");
    expect(listSearch(list)).toBe("?state=archived&category=a+b&tag=%C3%A4&sort=oldest&q=x%26y");
    expect(parseListParams(listSearch(list))).toEqual(list);
  });
});

describe("return paths", () => {
  it("accepts the app's own paths", () => {
    expect(isReturnPath("/posts?tag=winter&sort=oldest")).toBe(true);
    expect(isReturnPath("/blog/posts")).toBe(true);
    expect(isReturnPath("/authors")).toBe(true);
  });

  it("refuses other origins, the sign-in and API routes", () => {
    for (const p of ["//evil.example", "/\\evil.example", "https://evil.example/", "posts", "/auth/login", "/auth", "/api/me", "/api?x", "/a b"]) {
      expect(isReturnPath(p), p).toBe(false);
    }
  });
});
