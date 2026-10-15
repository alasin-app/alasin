// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ulid } from "../../src/shared/ulid";
import { ALLOWED_USER, APP_URL } from "../fixtures";
import { call, type FakeGitHub, fakeGitHub, login } from "./helpers";

let gh: FakeGitHub;
let cookie: string;
let accessToken: string;

beforeEach(async () => {
  gh = fakeGitHub();
  ({ cookie, accessToken } = await login(gh, ALLOWED_USER));
});
afterEach(() => {
  vi.restoreAllMocks();
});

const draftText = (id: string, title = "Hello", body = "First words.") =>
  `---\ntitle: "${title}"\ndate: 2026-10-15T12:00:00+03:00\ndraft: true\ndraftId: "${id}"\n---\n\n${body}\n`;

function save(type: string, id: string, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return call(`/api/drafts/${type}/${id}`, {
    method: "PUT",
    cookie,
    headers: { "X-Alasin": "1", Origin: APP_URL, "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("drafts", () => {
  it("commits a new draft to the drafts folder as the signed-in user", async () => {
    const id = ulid();
    const res = await save("post", id, { content: draftText(id), sha: null, title: "Hello" });
    expect(res.status).toBe(200);
    const { sha } = (await res.json()) as { sha: string };
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
    expect(gh.repo.files().get(`drafts/posts/${id}.md`)).toBe(draftText(id));
    expect(gh.repo.lastCommit().message).toBe("Save draft post: Hello");
    // Every GitHub call used the user's own token, so the commit is theirs.
    expect(new Set(gh.repo.tokens)).toEqual(new Set([accessToken]));
  });

  it("saves pages to their own folder", async () => {
    const id = ulid();
    expect((await save("page", id, { content: draftText(id), sha: null })).status).toBe(200);
    expect(gh.repo.files().has(`drafts/pages/${id}.md`)).toBe(true);
  });

  it("updates a draft when the expected version matches", async () => {
    const id = ulid();
    const first = (await (await save("post", id, { content: draftText(id), sha: null })).json()) as { sha: string };
    const res = await save("post", id, { content: draftText(id, "Hello", "More words."), sha: first.sha });
    expect(res.status).toBe(200);
    expect(gh.repo.files().get(`drafts/posts/${id}.md`)).toContain("More words.");
  });

  it("refuses to overwrite a draft changed elsewhere (e.g. on GitHub)", async () => {
    const id = ulid();
    const first = (await (await save("post", id, { content: draftText(id), sha: null })).json()) as { sha: string };
    await gh.repo.write(`drafts/posts/${id}.md`, draftText(id, "Hello", "Edited on GitHub."));
    const res = await save("post", id, { content: draftText(id, "Hello", "My version."), sha: first.sha });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "conflict" });
    expect(gh.repo.files().get(`drafts/posts/${id}.md`)).toContain("Edited on GitHub.");
  });

  it("refuses to create a draft that already exists", async () => {
    const id = ulid();
    await save("post", id, { content: draftText(id), sha: null });
    expect((await save("post", id, { content: draftText(id, "Other"), sha: null })).status).toBe(409);
  });

  it("retries when an unrelated commit lands meanwhile", async () => {
    const id = ulid();
    gh.repo.beforeRefUpdate = () => gh.repo.write("content/posts/other.md", "---\ntitle: other\n---\n");
    const res = await save("post", id, { content: draftText(id), sha: null });
    expect(res.status).toBe(200);
    const files = gh.repo.files();
    expect(files.has(`drafts/posts/${id}.md`)).toBe(true);
    expect(files.has("content/posts/other.md")).toBe(true);
  });

  it("lists and reads drafts", async () => {
    const a = ulid();
    const b = ulid();
    await save("post", a, { content: draftText(a), sha: null });
    await save("page", b, { content: draftText(b, "About"), sha: null });
    await gh.repo.write("drafts/posts/notes.txt", "not a draft");
    const list = (await (await call("/api/drafts", { cookie })).json()) as { drafts: { type: string; id: string }[] };
    expect(list.drafts.map((d) => `${d.type}:${d.id}`).sort()).toEqual([`page:${b}`, `post:${a}`].sort());
    const one = (await (await call(`/api/drafts/page/${b}`, { cookie })).json()) as { content: string; sha: string };
    expect(one.content).toBe(draftText(b, "About"));
    expect((await call(`/api/drafts/page/${ulid()}`, { cookie })).status).toBe(404);
  });

  it("rejects path tricks, unknown types and malformed IDs", async () => {
    const id = ulid();
    for (const [type, draftId] of [
      ["post", "..%2F..%2Fcontent%2Fposts%2Fx"],
      ["post", "../x"],
      ["posts", id],
      ["../content", id],
      ["post", id.toLowerCase()],
      ["post", `${id}.md`],
    ]) {
      const res = await save(type!, draftId!, { content: draftText(id), sha: null });
      expect([400, 404]).toContain(res.status);
    }
    expect(gh.repo.files().size).toBe(0);
  });

  it("validates the content", async () => {
    const id = ulid();
    expect((await save("post", id, { content: "no front matter", sha: null })).status).toBe(400);
    expect((await save("post", id, { content: draftText(ulid()), sha: null })).status).toBe(400); // another draft's ID
    expect((await save("post", id, { content: draftText(id), sha: "not-a-sha" })).status).toBe(400);
    expect((await save("post", id, { content: draftText(id), sha: null, path: "content/posts/x.md" })).status).toBe(400);
    const huge = draftText(id, "Big", "x".repeat(1024 * 1024));
    expect((await save("post", id, { content: huge, sha: null })).status).toBe(413);
    expect(gh.repo.files().size).toBe(0);
  });

  it("requires a session and the CSRF header", async () => {
    const id = ulid();
    expect((await call("/api/drafts", {})).status).toBe(401);
    const noHeader = await call(`/api/drafts/post/${id}`, {
      method: "PUT",
      cookie,
      headers: { Origin: APP_URL, "Content-Type": "application/json" },
      body: JSON.stringify({ content: draftText(id), sha: null }),
    });
    expect(noHeader.status).toBe(403);
  });

  it("explains when GitHub refuses (no write access)", async () => {
    vi.spyOn(gh.repo, "handle").mockResolvedValue(Response.json({ message: "Resource not accessible" }, { status: 403 }));
    const id = ulid();
    const res = await save("post", id, { content: draftText(id), sha: null });
    expect(res.status).toBe(502);
    expect(((await res.json()) as { message: string }).message).toMatch(/write access/);
  });
});
