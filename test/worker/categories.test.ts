// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseConfig } from "../../src/shared/config/schema";
import { ALLOWED_USER, testConfig } from "../fixtures";
import { call, type FakeGitHub, fakeGitHub, login, mutating } from "./helpers";

let gh: FakeGitHub;
let cookie: string;

beforeEach(async () => {
  gh = fakeGitHub();
  ({ cookie } = await login(gh, ALLOWED_USER));
  await gh.repo.write("content/categories/travel/_index.md", '---\ntitle: "Travel"\nslug: "travel"\n---\n');
  await gh.repo.write("content/categories/holidays/_index.md", '---\ntitle: "Holidays"\nslug: "holidays"\nparent: "travel"\n---\n');
});
afterEach(() => {
  vi.restoreAllMocks();
});

const withUrls = { ALASIN_CONFIG_JSON: JSON.stringify(parseConfig({ ...testConfig, categories: { url_pattern: "/category/{path}/" } })) };
const post = (path: string, body: unknown, env = withUrls) => call(`/api/categories${path}`, mutating(cookie, body), env);

async function shaOf(path: string): Promise<string> {
  const res = await gh.repo.handle(new Request(`https://api.github.com/repos/${gh.repo.owner}/${gh.repo.name}/contents/${path}`));
  return ((await res!.json()) as { sha: string }).sha;
}

describe("categories", () => {
  it("adds a category under a parent, with its url from the pattern", async () => {
    const res = await post("", { title: "Summer 2016", parent: "holidays" });
    expect(await res.json()).toEqual({ slug: "summer-2016", path: "content/categories/summer-2016/_index.md" });
    expect(gh.repo.files().get("content/categories/summer-2016/_index.md")).toBe(
      '---\ntitle: "Summer 2016"\nslug: "summer-2016"\nparent: "holidays"\nurl: "/category/travel/holidays/summer-2016/"\n---\n',
    );
    expect(gh.repo.lastCommit().message).toBe("Add category: Summer 2016");
  });

  it("refuses an address in use and an unknown parent", async () => {
    expect((await post("", { title: "Travel" })).status).toBe(409);
    expect((await post("", { title: "X", parent: "nope" })).status).toBe(400);
  });

  it("deletes an unused category", async () => {
    await post("", { title: "Empty" });
    const res = await post("/delete", { slug: "empty", changes: [] });
    expect(await res.json()).toEqual({ deleted: "empty", changed: 0 });
    expect(gh.repo.files().has("content/categories/empty/_index.md")).toBe(false);
  });

  it("deletes a used category together with its removal from the posts, in one commit", async () => {
    const p = "content/posts/2026/a.md";
    const text = '---\ntitle: "A"\ncategories: ["holidays", "travel"]\n---\n\nText.\n';
    await gh.repo.write(p, text);
    const before = gh.repo.commits.size;
    const res = await post("/delete", { slug: "holidays", changes: [{ path: p, sha: await shaOf(p), content: text.replace('["holidays", "travel"]', '["travel"]') }] });
    expect(await res.json()).toEqual({ deleted: "holidays", changed: 1 });
    expect(gh.repo.commits.size).toBe(before + 1);
    expect(gh.repo.files().get(p)).toContain('categories: ["travel"]');
    expect(gh.repo.files().has("content/categories/holidays/_index.md")).toBe(false);
  });

  it("refuses a category with subcategories, changes that keep it, and changes outside the content", async () => {
    expect(await (await post("/delete", { slug: "travel", changes: [] })).json()).toMatchObject({ error: "has_children", children: ["holidays"] });
    const p = "content/posts/b.md";
    const text = '---\ntitle: "B"\ncategories: ["holidays"]\n---\n';
    await gh.repo.write(p, text);
    expect((await post("/delete", { slug: "holidays", changes: [{ path: p, sha: await shaOf(p), content: text }] })).status).toBe(400);
    expect((await post("/delete", { slug: "holidays", changes: [{ path: "wrangler.toml", sha: "0".repeat(40), content: "---\n---\n" }] })).status).toBe(400);
    expect(gh.repo.files().has("content/categories/holidays/_index.md")).toBe(true);
  });

  it("is only for term pages", async () => {
    const dataFile = { ALASIN_CONFIG_JSON: JSON.stringify(parseConfig({ ...testConfig, categories: { storage: "data-file", path: "data/categories.yaml" } })) };
    expect(await (await post("", { title: "X" }, dataFile)).json()).toMatchObject({ error: "unsupported" });
  });
});
