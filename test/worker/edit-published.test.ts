// SPDX-License-Identifier: MIT
import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseConfig } from "../../src/shared/config/schema";
import { ulid } from "../../src/shared/ulid";
import { ALLOWED_USER, testConfig } from "../fixtures";
import { call, type FakeGitHub, fakeGitHub, login, mutating } from "./helpers";

let gh: FakeGitHub;
let cookie: string;

beforeEach(async () => {
  gh = fakeGitHub();
  ({ cookie } = await login(gh, ALLOWED_USER));
  for (const bucket of [env.MEDIA, env.DRAFTS]) {
    const listed = await bucket.list();
    if (listed.objects.length) await bucket.delete(listed.objects.map((o) => o.key));
  }
});
afterEach(() => {
  vi.restoreAllMocks();
});

const POST = "content/posts/2019/trip.md";
const original = `---\ntitle:   'Trip'\ndate: 2019-08-02T22:54:16+03:00\nslug: "trip"\nurl: "/2019/08/02/trip/"\n# comment\ndraft: false\nlastmod: 2021-07-31T17:00:10+03:00\n---\n\nOld text.\n`;

const withUrls = parseConfig({ ...testConfig, site: { ...testConfig.site, post_url: "/{yyyy}/{mm}/{dd}/{slug}/", post_filename: "{yyyy}/{slug}.md" } });

function put(body: Record<string, unknown>, config = withUrls) {
  return call("/api/content/file", { ...mutating(cookie, body), method: "PUT" }, { ALASIN_CONFIG_JSON: JSON.stringify(config) });
}

async function open(path = POST) {
  return (await (await call(`/api/content/file?path=${encodeURIComponent(path)}`, { cookie })).json()) as { content: string; sha: string };
}

describe("editing published posts", () => {
  it("opens a published post, and nothing outside the content folders", async () => {
    await gh.repo.write(POST, original);
    expect((await open()).content).toBe(original);
    expect((await call("/api/content/file?path=wrangler.toml", { cookie })).status).toBe(404);
    expect((await call(`/api/content/file?path=${encodeURIComponent("content/posts/../../x.md")}`, { cookie })).status).toBe(404);
  });

  it("saves with lastmod updated, leaving the rest of the front matter as written", async () => {
    await gh.repo.write(POST, original);
    const { sha } = await open();
    const edited = original.replace("Old text.", "New text.");
    const res = await put({ path: POST, content: edited, sha });
    expect(res.status).toBe(200);
    const saved = gh.repo.files().get(POST)!;
    expect(saved).toMatch(/^---\ntitle: {3}'Trip'\ndate: 2019-08-02T22:54:16\+03:00\nslug: "trip"\nurl: "\/2019\/08\/02\/trip\/"\n# comment\ndraft: false\nlastmod: 20\d\d-\d\d-\d\dT\d\d:\d\d:\d\dZ\n---\n\nNew text.\n$/);
    expect(((await res.json()) as { content: string }).content).toBe(saved);
    expect(gh.repo.lastCommit().message).toBe("Update post: Trip");
  });

  it("renames the file and updates the url when the address or date was changed", async () => {
    await gh.repo.write(POST, original);
    const { sha } = await open();
    const edited = original.replace('slug: "trip"', 'slug: "summer-trip"');
    const res = await put({ path: POST, content: edited, sha, day: "2019-08-02", updateUrl: true });
    expect(await res.json()).toMatchObject({ path: "content/posts/2019/summer-trip.md" });
    const files = gh.repo.files();
    expect(files.has(POST)).toBe(false);
    expect(files.get("content/posts/2019/summer-trip.md")).toContain('url: "/2019/08/02/summer-trip/"');

    // A new date in another year moves it to that year's folder.
    const moved = (await open("content/posts/2019/summer-trip.md")).sha;
    const redated = files.get("content/posts/2019/summer-trip.md")!.replace("date: 2019-08-02T22:54:16+03:00", "date: 2020-01-05T10:00:00Z");
    await put({ path: "content/posts/2019/summer-trip.md", content: redated, sha: moved, day: "2020-01-05", updateUrl: true });
    expect(gh.repo.files().get("content/posts/2020/summer-trip.md")).toContain('url: "/2020/01/05/summer-trip/"');
  });

  it("refuses an address another post already has", async () => {
    await gh.repo.write(POST, original);
    await gh.repo.write("content/posts/2019/taken.md", original);
    const { sha } = await open();
    const res = await put({ path: POST, content: original.replace('slug: "trip"', 'slug: "taken"'), sha, day: "2019-08-02", updateUrl: true });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "exists" });
    expect(gh.repo.files().has(POST)).toBe(true);
  });

  it("keeps the file where it is when only the text changes", async () => {
    await gh.repo.write(POST, original);
    const { sha } = await open();
    const res = await put({ path: POST, content: original.replace("Old text.", "New."), sha, day: "2019-08-02" });
    expect(await res.json()).toMatchObject({ path: POST });
  });

  it("copies photos added while editing to MEDIA, then clears them from DRAFTS", async () => {
    await gh.repo.write(POST, original);
    const { sha } = await open();
    const editId = ulid();
    await env.DRAFTS.put(`${editId}/new.jpg`, "photo", { httpMetadata: { contentType: "image/jpeg" } });
    const edited = original.replace("Old text.", `Old text.\n\n![](/api/draft-media/${editId}/new.jpg)`);
    expect((await put({ path: POST, content: edited, sha, day: "2019-08-02", editId })).status).toBe(200);
    expect(gh.repo.files().get(POST)).toContain("![](/img/2019/08/02/new.jpg)");
    expect((await env.MEDIA.list()).objects.map((o) => o.key)).toEqual(["2019/08/02/new.jpg"]);
    expect((await env.DRAFTS.list()).objects).toHaveLength(0);
  });

  it("refuses to overwrite a post changed elsewhere", async () => {
    await gh.repo.write(POST, original);
    const { sha } = await open();
    await gh.repo.write(POST, original.replace("Old text.", "Edited on GitHub."));
    const res = await put({ path: POST, content: original.replace("Old text.", "Mine."), sha });
    expect(res.status).toBe(409);
    expect(gh.repo.files().get(POST)).toContain("Edited on GitHub.");
  });

  it("refuses paths outside the published content", async () => {
    await gh.repo.write("drafts/posts/x.md", original);
    const res = await put({ path: "drafts/posts/x.md", content: original, sha: "0".repeat(40) });
    expect(res.status).toBe(404);
  });
});

describe("where a draft went", () => {
  const draft = (id: string) => `---\ntitle: "Trip"\ndate: 2026-10-15T09:30:00Z\nslug: "trip"\ndraft: true\ndraftId: "${id}"\n---\n\nText.\n`;

  async function publishDraft(id: string) {
    await gh.repo.write(`drafts/posts/${id}.md`, draft(id));
    const sha = ((await (await call(`/api/drafts/post/${id}`, { cookie })).json()) as { sha: string }).sha;
    return call(`/api/drafts/post/${id}/publish`, mutating(cookie, { sha }));
  }

  it("finds a draft published from another device", async () => {
    const id = ulid();
    expect((await publishDraft(id)).status).toBe(200);
    const fate = await (await call(`/api/drafts/post/${id}/fate`, { cookie })).json();
    expect(fate).toEqual({ state: "published", path: "content/posts/trip.md", exists: true });
  });

  it("tells a draft that still exists, one deleted, and one never saved", async () => {
    const kept = ulid();
    await gh.repo.write(`drafts/posts/${kept}.md`, draft(kept));
    expect(await (await call(`/api/drafts/post/${kept}/fate`, { cookie })).json()).toEqual({ state: "draft" });
    await gh.repo.write(`drafts/posts/${kept}.md`, null);
    expect(await (await call(`/api/drafts/post/${kept}/fate`, { cookie })).json()).toEqual({ state: "deleted" });
    expect(await (await call(`/api/drafts/post/${ulid()}/fate`, { cookie })).json()).toEqual({ state: "unknown" });
  });
});

