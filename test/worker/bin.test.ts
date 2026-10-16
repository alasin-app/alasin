// SPDX-License-Identifier: MIT
import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ulid } from "../../src/shared/ulid";
import { ALLOWED_USER } from "../fixtures";
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

const text = (title: string) => `---\ntitle: "${title}"\n---\n\nText.\n`;

async function shaOf(path: string): Promise<string> {
  const res = await gh.repo.handle(new Request(`https://api.github.com/repos/${gh.repo.owner}/${gh.repo.name}/contents/${path}`));
  return ((await res!.json()) as { sha: string }).sha;
}

const post = (action: string, body: Record<string, unknown>) => call(`/api/bin/${action}`, mutating(cookie, body));

describe("the Bin", () => {
  it("moves a published post, an archived one and a draft into the Bin under their old paths", async () => {
    const id = ulid();
    const paths = ["content/posts/2026/a.md", "archive/content/posts/2020/b.md", `drafts/posts/${id}.md`];
    for (const p of paths) await gh.repo.write(p, text(p));
    for (const p of paths) {
      const res = await post("delete", { path: p, sha: await shaOf(p) });
      expect(await res.json()).toEqual({ path: `bin/${p}` });
    }
    const files = gh.repo.files();
    for (const p of paths) {
      expect(files.has(p)).toBe(false);
      expect(files.get(`bin/${p}`)).toBe(text(p));
    }
    expect(gh.repo.lastCommit().message).toBe(`Delete post: drafts/posts/${id}.md`);
  });

  it("recovers to the old place, or under a new name if something new is there", async () => {
    const p = "content/posts/2026/a.md";
    await gh.repo.write(p, text("A"));
    await post("delete", { path: p, sha: await shaOf(p) });
    await gh.repo.write(p, text("New A"));

    const refused = await post("recover", { path: `bin/${p}`, sha: await shaOf(`bin/${p}`) });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ error: "exists", path: p });
    expect(gh.repo.files().get(p)).toBe(text("New A"));

    const renamed = await post("recover", { path: `bin/${p}`, sha: await shaOf(`bin/${p}`), rename: true });
    expect(await renamed.json()).toEqual({ path: "content/posts/2026/a-2.md" });
    expect(gh.repo.files().get("content/posts/2026/a-2.md")).toBe(text("A"));
    expect(gh.repo.files().has(`bin/${p}`)).toBe(false);
  });

  it("recovers a draft back to the drafts folder", async () => {
    const id = ulid();
    const p = `drafts/posts/${id}.md`;
    await gh.repo.write(p, text("Draft"));
    await post("delete", { path: p, sha: await shaOf(p) });
    expect(await (await post("recover", { path: `bin/${p}`, sha: await shaOf(`bin/${p}`) })).json()).toEqual({ path: p, draftId: id });
  });

  it("deletes permanently only from the Bin, then removes deleted drafts' photos (never MEDIA)", async () => {
    const id = ulid();
    const draft = `drafts/posts/${id}.md`;
    const page = "content/pages/old.md";
    await gh.repo.write(draft, text("Draft"));
    await gh.repo.write(page, text("Old"));
    await env.DRAFTS.put(`${id}/photo.jpg`, "x");
    await env.MEDIA.put("2026/10/16/photo.jpg", "published");
    for (const p of [draft, page]) await post("delete", { path: p, sha: await shaOf(p) });
    // Still recoverable: the draft keeps its photos while in the Bin.
    expect((await env.DRAFTS.list()).objects).toHaveLength(1);

    const items = [`bin/${draft}`, `bin/${page}`];
    const res = await post("purge", { items: await Promise.all(items.map(async (p) => ({ path: p, sha: await shaOf(p) }))) });
    expect(await res.json()).toEqual({ removed: 2 });
    expect(gh.repo.lastCommit().message).toBe("Empty the Bin (2 items)");
    for (const p of items) expect(gh.repo.files().has(p)).toBe(false);
    expect((await env.DRAFTS.list()).objects).toHaveLength(0);
    expect((await env.MEDIA.list()).objects).toHaveLength(1);
  });

  it("refuses to delete anything outside the Bin permanently, and other bad paths", async () => {
    await gh.repo.write("content/posts/x.md", text("X"));
    expect((await post("purge", { items: [{ path: "content/posts/x.md", sha: await shaOf("content/posts/x.md") }] })).status).toBe(400);
    expect(gh.repo.files().has("content/posts/x.md")).toBe(true);
    expect((await post("delete", { path: "wrangler.toml", sha: "0".repeat(40) })).status).toBe(400);
    expect((await post("delete", { path: "bin/content/posts/x.md", sha: "0".repeat(40) })).status).toBe(400);
    expect((await post("recover", { path: "content/posts/x.md", sha: "0".repeat(40) })).status).toBe(400);
  });

  it("refuses to delete what someone else is editing", async () => {
    const id = ulid();
    const p = `drafts/posts/${id}.md`;
    await gh.repo.write(p, text("Draft"));
    const locks = env.LOCKS.get(env.LOCKS.idFromName("locks"));
    await locks.acquire(`draft:${id}`, "tab-other0", { uid: 9, login: "jane", name: "Jane Doe" }, 180_000);
    const res = await post("delete", { path: p, sha: await shaOf(p) });
    expect(await res.json()).toMatchObject({ error: "locked" });
    await locks.release(`draft:${id}`, "tab-other0");
  });
});
