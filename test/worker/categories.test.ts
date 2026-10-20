// SPDX-License-Identifier: MIT
import { env } from "cloudflare:test";
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

  it("refuses to delete while someone else is editing a post it changes", async () => {
    const p = "content/posts/2026/a.md";
    const text = '---\ntitle: "A"\ncategories: ["holidays"]\n---\n\nText.\n';
    await gh.repo.write(p, text);
    await env.LOCKS.get(env.LOCKS.idFromName("locks")).acquire(`file:${p}`, "tab-other0", { uid: 9, login: "jane", name: "Jane Doe" }, 180_000);
    const res = await post("/delete", { slug: "holidays", changes: [{ path: p, sha: await shaOf(p), content: text.replace('["holidays"]', "[]") }] });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { message: string }).message).toContain("“A”");
    expect(gh.repo.files().has("content/categories/holidays/_index.md")).toBe(true);
    await env.LOCKS.get(env.LOCKS.idFromName("locks")).release(`file:${p}`, "tab-other0");
  });

  it("renames a category's address: its term page moves, posts and children follow, the old address stays an alias, in one commit", async () => {
    const p = "content/posts/2026/a.md";
    const text = '---\ntitle: "A"\ncategories: ["travel"]\n---\n\nText.\n';
    await gh.repo.write(p, text);
    const before = gh.repo.commits.size;
    const res = await post("/update", { slug: "travel", title: "Trips", newSlug: "trips", changes: [{ path: p, sha: await shaOf(p), content: text.replace('["travel"]', '["trips"]') }] });
    expect(await res.json()).toEqual({ slug: "trips", changed: 1 });
    expect(gh.repo.commits.size).toBe(before + 1);
    expect(gh.repo.lastCommit().message).toBe("Rename category travel to trips, updating 1 item");
    const files = gh.repo.files();
    expect(files.has("content/categories/travel/_index.md")).toBe(false);
    expect(files.get("content/categories/trips/_index.md")).toBe('---\ntitle: "Trips"\nslug: "trips"\nurl: "/category/trips/"\naliases: ["/categories/travel/"]\n---\n');
    expect(files.get("content/categories/holidays/_index.md")).toContain('parent: "trips"');
    expect(files.get("content/categories/holidays/_index.md")).toContain('url: "/category/trips/holidays/"');
    expect(files.get(p)).toContain('categories: ["trips"]');
  });

  it("moves a category to the top level, its address and its old one as an alias", async () => {
    await gh.repo.write("content/categories/holidays/_index.md", '---\ntitle: "Holidays"\nslug: "holidays"\nparent: "travel"\nurl: "/category/travel/holidays/"\n---\n');
    expect(await (await post("/update", { slug: "holidays", parent: "", changes: [] })).json()).toEqual({ slug: "holidays", changed: 0 });
    expect(gh.repo.files().get("content/categories/holidays/_index.md")).toBe('---\ntitle: "Holidays"\nslug: "holidays"\nurl: "/category/holidays/"\naliases: ["/category/travel/holidays/"]\n---\n');
    expect(gh.repo.lastCommit().message).toBe("Move category holidays to the top level");
  });

  it("refuses a loop, an address in use, post changes without a new address, and other files in the folder", async () => {
    expect((await post("/update", { slug: "travel", parent: "holidays", changes: [] })).status).toBe(400);
    expect((await post("/update", { slug: "travel", newSlug: "holidays", changes: [] })).status).toBe(409);
    const p = "content/posts/c.md";
    await gh.repo.write(p, '---\ncategories: ["travel"]\n---\n');
    expect((await post("/update", { slug: "travel", title: "T", changes: [{ path: p, sha: await shaOf(p), content: '---\ncategories: ["x"]\n---\n' }] })).status).toBe(400);
    await gh.repo.write("content/categories/travel/cover.jpg", "x");
    expect(await (await post("/update", { slug: "travel", newSlug: "trips", changes: [] })).json()).toMatchObject({ error: "has_files" });
  });
});
