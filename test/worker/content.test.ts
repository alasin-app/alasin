// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildIndex, mediaUsage } from "../../src/web/lib/content-index";
import { parseConfig } from "../../src/shared/config/schema";
import { ALLOWED_USER, testConfig } from "../fixtures";
import { call, type FakeGitHub, fakeGitHub, login, mutating } from "./helpers";

let gh: FakeGitHub;
let cookie: string;

beforeEach(async () => {
  gh = fakeGitHub();
  ({ cookie } = await login(gh, ALLOWED_USER));
});
afterEach(() => {
  vi.restoreAllMocks();
});

const folders = { content: "content", posts: "content/posts", pages: "content/pages", drafts: "drafts", archive: "archive", bin: "bin" };
const site = { folders, authorField: "author", authorIdField: "author_id", media: { publicUrl: "https://media.example.com/", contentPrefix: "/img/", browse: [""], byMonth: true } };

describe("content", () => {
  it("returns the content folders in one response the browser can index", async () => {
    await gh.repo.write("content/posts/2026/a.md", '---\ntitle: "A"\n---\nText\n');
    await gh.repo.write("content/pages/about.md", '---\ntitle: "About"\n---\n');
    await gh.repo.write("static/big.jpg", "not read");
    await gh.repo.write("content/_index.md", '---\nimage: "/img/2015/01/19/home.jpg"\n---\n');
    await gh.repo.write("content/projects/radio/index.md", "![](/img/2016/02/03/radio.jpg)\n");
    const res = await call("/api/content", { cookie });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const index = buildIndex(await res.json(), site);
    expect(index.commit).toBe(gh.repo.head);
    expect(index.items.map((i) => i.path).sort()).toEqual(["content/pages/about.md", "content/posts/2026/a.md"]);
    // The home page and other sections aren't items, but the images they use are used.
    const used = mediaUsage(index);
    expect(["2015/01/19/home.jpg", "2016/02/03/radio.jpg", "2016/02/03/other.jpg"].map(used)).toEqual([true, true, false]);
  });

  it("reads posts and pages without a common folder on their own, as before", async () => {
    await gh.repo.write("posts/a.md", '---\ntitle: "A"\n---\n');
    await gh.repo.write("pages/b.md", '---\ntitle: "B"\n---\n');
    await gh.repo.write("README.md", "/img/2020/01/01/readme.jpg");
    const config = parseConfig({ ...testConfig, site: { ...testConfig.site, posts_dir: "posts", pages_dir: "pages" } });
    const res = await call("/api/content", { cookie }, { ALASIN_CONFIG_JSON: JSON.stringify(config) });
    const own = { ...site, folders: { ...folders, content: "", posts: "posts", pages: "pages" } };
    const index = buildIndex(await res.json(), own);
    expect(index.items.map((i) => i.path).sort()).toEqual(["pages/b.md", "posts/a.md"]);
    expect(mediaUsage(index)("2020/01/01/readme.jpg")).toBe(false);
  });

  it("gives the head commit, to check a cached list", async () => {
    const res = await call("/api/content/head", { cookie });
    expect(await res.json()).toEqual({ commit: gh.repo.head });
  });

  it("requires a session", async () => {
    expect((await call("/api/content")).status).toBe(401);
  });
});

describe("content changes", () => {
  it("lists the files changed since a commit, and reads only those", async () => {
    await gh.repo.write("content/posts/a.md", '---\ntitle: "A"\n---\n');
    await gh.repo.write("content/posts/b.md", '---\ntitle: "B"\n---\n');
    const base = gh.repo.head;
    await gh.repo.write("content/posts/a.md", '---\ntitle: "A2"\n---\n');
    await gh.repo.write("content/posts/b.md", null);
    await gh.repo.write("content/pages/new.md", '---\ntitle: "New"\n---\n');

    const changes = (await (await call(`/api/content/changes?base=${base}`, { cookie })).json()) as { files: { filename: string; status: string }[] };
    expect(changes.files.map((f) => `${f.status} ${f.filename}`).sort()).toEqual(["added content/pages/new.md", "modified content/posts/a.md", "removed content/posts/b.md"]);

    const res = await call("/api/content/files", mutating(cookie, { paths: ["content/posts/a.md", "content/pages/new.md"] }));
    const files = (await res.json()) as { data: { repository: Record<string, { text: string } | null> } };
    expect(files.data.repository.p0!.text).toContain("A2");
    expect(files.data.repository.p1!.text).toContain("New");
  });

  it("reads files only from the content folders", async () => {
    const res = await call("/api/content/files", mutating(cookie, { paths: ["wrangler.toml"] }));
    expect(res.status).toBe(400);
    expect((await call("/api/content/files", mutating(cookie, { paths: ["content/_index.md"] }))).status).toBe(200);
    expect((await call("/api/content/files", mutating(cookie, { paths: ["content/posts/../../x.md"] }))).status).toBe(400);
    expect((await call("/api/content/changes?base=nope", { cookie })).status).toBe(400);
  });
});

describe("content history", () => {
  it("gives each file's last change and who made it", async () => {
    await gh.repo.write("content/posts/a.md", '---\ntitle: "A"\n---\n');
    await gh.repo.write("content/posts/b.md", '---\ntitle: "B"\n---\n');
    const res = await call("/api/content/history", mutating(cookie, { paths: ["content/posts/a.md", "content/posts/none.md"] }));
    const data = (await res.json()) as { data: { repository: { ref: { target: Record<string, { nodes: { author: { user: { login: string } } }[] }> } } } };
    expect(data.data.repository.ref.target.h0!.nodes[0]!.author.user.login).toBe("octocat");
    expect(data.data.repository.ref.target.h1!.nodes).toEqual([]);
    expect((await call("/api/content/history", mutating(cookie, { paths: Array.from({ length: 51 }, (_, i) => `content/posts/${i}.md`) }))).status).toBe(400);
  });
});
