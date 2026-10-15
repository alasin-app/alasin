// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildIndex } from "../../src/web/lib/content-index";
import { ALLOWED_USER } from "../fixtures";
import { call, type FakeGitHub, fakeGitHub, login } from "./helpers";

let gh: FakeGitHub;
let cookie: string;

beforeEach(async () => {
  gh = fakeGitHub();
  ({ cookie } = await login(gh, ALLOWED_USER));
});
afterEach(() => {
  vi.restoreAllMocks();
});

const folders = { posts: "content/posts", pages: "content/pages", drafts: "drafts", archive: "archive", bin: "bin" };

describe("content", () => {
  it("returns the content folders in one response the browser can index", async () => {
    await gh.repo.write("content/posts/2026/a.md", '---\ntitle: "A"\n---\nText\n');
    await gh.repo.write("content/pages/about.md", '---\ntitle: "About"\n---\n');
    await gh.repo.write("static/big.jpg", "not read");
    const res = await call("/api/content", { cookie });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const index = buildIndex(await res.json(), folders);
    expect(index.commit).toBe(gh.repo.head);
    expect(index.items.map((i) => i.path)).toEqual(["content/posts/2026/a.md", "content/pages/about.md"]);
  });

  it("gives the head commit, to check a cached list", async () => {
    const res = await call("/api/content/head", { cookie });
    expect(await res.json()).toEqual({ commit: gh.repo.head });
  });

  it("requires a session", async () => {
    expect((await call("/api/content")).status).toBe(401);
  });
});
