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

const draft = (id: string, body: string, extra = "") =>
  `---\ntitle: "Summer trip"\ndate: 2026-10-15T09:30:00Z\nslug: "summer-trip"\ndraft: true\n${extra}draftId: "${id}"\n---\n\n${body}\n`;

async function saveDraft(id: string, text: string, type = "post"): Promise<string> {
  await gh.repo.write(`drafts/${type}s/${id}.md`, text);
  return (await gh.repo.handle(new Request(`https://api.github.com/repos/${gh.repo.owner}/${gh.repo.name}/contents/drafts/${type}s/${id}.md`)))!
    .json()
    .then((r) => (r as { sha: string }).sha);
}

async function putImage(key: string, bytes = `image ${key}`) {
  await env.DRAFTS.put(key, bytes, { httpMetadata: { contentType: key.endsWith(".webp") ? "image/webp" : "image/jpeg" } });
}

function publish(id: string, body: Record<string, unknown>, type = "post") {
  return call(`/api/drafts/${type}/${id}/publish`, mutating(cookie, body));
}

const keys = async (bucket: R2Bucket) => (await bucket.list()).objects.map((o) => o.key).sort();

describe("publish", () => {
  it("copies the used images, moves the file to its content path in one commit, then clears the draft images", async () => {
    const id = ulid();
    await putImage(`${id}/photo.jpg`);
    await putImage(`${id}/photo-480.webp`);
    await putImage(`${id}/photo-960.webp`);
    await putImage(`${id}/unused.jpg`);
    const sha = await saveDraft(id, draft(id, `Text.\n\n![](/api/draft-media/${id}/photo.jpg)`, `image: "/api/draft-media/${id}/photo.jpg"\n`));
    const commitsBefore = gh.repo.commits.size;

    const res = await publish(id, { sha });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ path: "content/posts/summer-trip.md" });

    const files = gh.repo.files();
    expect(files.has(`drafts/posts/${id}.md`)).toBe(false);
    const published = files.get("content/posts/summer-trip.md")!;
    expect(published).toContain("![](/img/2026/10/15/photo.jpg)");
    expect(published).toContain('image: "/img/2026/10/15/photo.jpg"');
    expect(published).toContain("draft: false");
    expect(published).not.toContain("draftId");
    expect(published).not.toContain("/api/draft-media/");
    expect(gh.repo.commits.size).toBe(commitsBefore + 1);
    expect(gh.repo.lastCommit().message).toBe("Publish post: Summer trip");

    expect(await keys(env.MEDIA)).toEqual(["2026/10/15/photo-480.webp", "2026/10/15/photo-960.webp", "2026/10/15/photo.jpg"]);
    const copy = await env.MEDIA.get("2026/10/15/photo.jpg");
    expect(await copy!.text()).toBe(`image ${id}/photo.jpg`);
    expect(copy!.httpMetadata?.cacheControl).toBe("public, max-age=604800");
    expect(await keys(env.DRAFTS)).toEqual([]);
  });

  it("never overwrites an image in MEDIA: a taken name gets -2", async () => {
    const id = ulid();
    await env.MEDIA.put("2026/10/15/photo.jpg", "someone else's photo");
    await putImage(`${id}/photo.jpg`);
    const sha = await saveDraft(id, draft(id, `![](/api/draft-media/${id}/photo.jpg)`));
    expect((await publish(id, { sha })).status).toBe(200);
    expect(await (await env.MEDIA.get("2026/10/15/photo.jpg"))!.text()).toBe("someone else's photo");
    expect(await (await env.MEDIA.get("2026/10/15/photo-2.jpg"))!.text()).toBe(`image ${id}/photo.jpg`);
    expect(gh.repo.files().get("content/posts/summer-trip.md")).toContain("/img/2026/10/15/photo-2.jpg");
  });

  it("keeps a main image and its variants under one name when only a variant is taken", async () => {
    const id = ulid();
    await env.MEDIA.put("2026/10/15/photo-480.webp", "taken");
    await putImage(`${id}/photo.jpg`);
    await putImage(`${id}/photo-480.webp`);
    const sha = await saveDraft(id, draft(id, `![](/api/draft-media/${id}/photo.jpg)`));
    expect((await publish(id, { sha })).status).toBe(200);
    expect(await keys(env.MEDIA)).toEqual(["2026/10/15/photo-2-480.webp", "2026/10/15/photo-2.jpg", "2026/10/15/photo-480.webp"]);
    expect(await (await env.MEDIA.get("2026/10/15/photo-480.webp"))!.text()).toBe("taken");
  });

  it("is safe to retry: a failed commit leaves the draft, and the retry reuses the copies", async () => {
    const id = ulid();
    await putImage(`${id}/photo.jpg`);
    const sha = await saveDraft(id, draft(id, `![](/api/draft-media/${id}/photo.jpg)`));
    await gh.repo.write("content/posts/summer-trip.md", "---\ntitle: other\n---\n");

    const first = await publish(id, { sha });
    expect(first.status).toBe(409);
    expect(await first.json()).toMatchObject({ error: "exists" });
    expect(gh.repo.files().has(`drafts/posts/${id}.md`)).toBe(true);
    expect(await keys(env.DRAFTS)).toEqual([`${id}/photo.jpg`]);

    await gh.repo.write("content/posts/summer-trip.md", null);
    expect((await publish(id, { sha })).status).toBe(200);
    expect(await keys(env.MEDIA)).toEqual(["2026/10/15/photo.jpg"]);
    expect(gh.repo.files().get("content/posts/summer-trip.md")).toContain("/img/2026/10/15/photo.jpg");
  });

  it("publishes only the saved version", async () => {
    const id = ulid();
    await putImage(`${id}/photo.jpg`);
    await saveDraft(id, draft(id, `![](/api/draft-media/${id}/photo.jpg)`));
    const res = await publish(id, { sha: "0".repeat(40) });
    expect(res.status).toBe(409);
    expect(await keys(env.MEDIA)).toEqual([]);
    expect(gh.repo.files().has(`drafts/posts/${id}.md`)).toBe(true);
  });

  it("uses the author's day for folders named by date", async () => {
    const id = ulid();
    await putImage(`${id}/photo.jpg`);
    const sha = await saveDraft(id, draft(id, `![](/api/draft-media/${id}/photo.jpg)`));
    expect((await publish(id, { sha, day: "2026-10-16" })).status).toBe(200);
    expect(await keys(env.MEDIA)).toEqual(["2026/10/16/photo.jpg"]);
  });

  it("refuses a draft without a title, or with a missing image, and changes nothing", async () => {
    const id = ulid();
    const untitled = await saveDraft(id, draft(id, "Text.").replace('title: "Summer trip"', 'title: ""'));
    expect(await (await publish(id, { sha: untitled })).json()).toMatchObject({ error: "no_title" });

    const other = ulid();
    const sha = await saveDraft(other, draft(other, `![](/api/draft-media/${other}/gone.jpg)`));
    const res = await publish(other, { sha });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "missing_image" });
    expect(gh.repo.files().has(`drafts/posts/${other}.md`)).toBe(true);
    expect(await keys(env.MEDIA)).toEqual([]);
  });

  it("publishes pages to the pages folder, and says when the draft is already gone", async () => {
    const id = ulid();
    const sha = await saveDraft(id, draft(id, "About us."), "page");
    expect((await publish(id, { sha }, "page")).status).toBe(200);
    expect(gh.repo.files().has("content/pages/summer-trip.md")).toBe(true);
    expect((await publish(id, { sha }, "page")).status).toBe(404);
  });

  it("sets lastmod, and url when a pattern is configured, keeping the front matter as written", async () => {
    const id = ulid();
    const sha = await saveDraft(id, draft(id, "Text."));
    const config = parseConfig({ ...testConfig, site: { ...testConfig.site, post_url: "/{yyyy}/{mm}/{dd}/{slug}/" } });
    const res = await call(`/api/drafts/post/${id}/publish`, mutating(cookie, { sha, day: "2026-10-15" }), { ALASIN_CONFIG_JSON: JSON.stringify(config) });
    expect(res.status).toBe(200);
    expect(gh.repo.files().get("content/posts/summer-trip.md")).toMatch(
      /^---\ntitle: "Summer trip"\ndate: 2026-10-15T09:30:00Z\nslug: "summer-trip"\ndraft: false\nlastmod: \S+Z\nurl: "\/2026\/10\/15\/summer-trip\/"\n---\n/,
    );
  });

  it("requires the CSRF header like every change", async () => {
    const id = ulid();
    const res = await call(`/api/drafts/post/${id}/publish`, { method: "POST", cookie, headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(res.status).toBe(403);
  });
});
