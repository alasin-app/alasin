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
});
afterEach(() => {
  vi.restoreAllMocks();
});

const POST = "content/posts/2019/trip.md";
const text = `---\ntitle: 'Trip'\ndate: 2019-08-02T22:54:16+03:00\nslug: "trip"\n# kept\ndraft: false\n---\n\nText.\n`;
const config = parseConfig({ ...testConfig, site: { ...testConfig.site, post_url: "/{yyyy}/{mm}/{dd}/{slug}/" } });

async function shaOf(path: string): Promise<string> {
  const res = await gh.repo.handle(new Request(`https://api.github.com/repos/${gh.repo.owner}/${gh.repo.name}/contents/${path}`));
  return ((await res!.json()) as { sha: string }).sha;
}

function act(body: Record<string, unknown>) {
  return call("/api/lifecycle", mutating(cookie, body), { ALASIN_CONFIG_JSON: JSON.stringify(config) });
}

describe("lifecycle", () => {
  it("unpublishes a post into a new draft, keeping its front matter", async () => {
    await gh.repo.write(POST, text);
    const res = await act({ action: "unpublish", path: POST, sha: await shaOf(POST) });
    expect(res.status).toBe(200);
    const { path, draftId, type } = (await res.json()) as { path: string; draftId: string; type: string };
    expect(type).toBe("post");
    expect(path).toBe(`drafts/posts/${draftId}.md`);
    const files = gh.repo.files();
    expect(files.has(POST)).toBe(false);
    expect(files.get(path)).toBe(text.replace("draft: false\n", "").replace("---\n\nText.", `draftId: "${draftId}"\n---\n\nText.`));
    expect(gh.repo.lastCommit().message).toBe("Unpublish post: Trip");
  });

  it("archives a post unchanged, and republishes it to the same place with lastmod", async () => {
    await gh.repo.write(POST, text);
    expect((await act({ action: "archive", path: POST, sha: await shaOf(POST) })).status).toBe(200);
    const archived = `archive/${POST}`;
    expect(gh.repo.files().get(archived)).toBe(text);
    expect(gh.repo.files().has(POST)).toBe(false);

    const res = await act({ action: "republish", path: archived, sha: await shaOf(archived) });
    expect(await res.json()).toMatchObject({ path: POST });
    expect(gh.repo.files().get(POST)).toMatch(/^---\ntitle: 'Trip'[\s\S]*draft: false\nlastmod: \S+Z\n---\n\nText\.\n$/);
    expect(gh.repo.files().has(archived)).toBe(false);
  });

  it("has no action for publishing in place: drafts are published from the drafts folder", async () => {
    const before = gh.repo.files().get(POST);
    expect((await act({ action: "publish", path: POST, sha: await shaOf(POST) })).status).toBe(400);
    expect(gh.repo.files().get(POST)).toBe(before);
  });

  it("refuses while someone else is editing it, but not for the editor holding the lock", async () => {
    await gh.repo.write(POST, text);
    await env.LOCKS.get(env.LOCKS.idFromName("locks")).acquire(`file:${POST}`, "tab-other0", { uid: 9, login: "jane", name: "Jane Doe" }, 180_000);
    const res = await act({ action: "archive", path: POST, sha: await shaOf(POST), lockId: "tab-mine00" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "locked" });
    expect((await act({ action: "archive", path: POST, sha: await shaOf(POST), lockId: "tab-other0" })).status).toBe(200);
    await env.LOCKS.get(env.LOCKS.idFromName("locks")).release(`file:${POST}`, "tab-other0");
  });

  it("refuses stale versions, taken destinations and files outside the content", async () => {
    await gh.repo.write(POST, text);
    expect((await act({ action: "archive", path: POST, sha: "0".repeat(40) })).status).toBe(409);
    await gh.repo.write(`archive/${POST}`, "old archived copy");
    const taken = await act({ action: "archive", path: POST, sha: await shaOf(POST) });
    expect(await taken.json()).toMatchObject({ error: "exists" });
    expect(gh.repo.files().get(`archive/${POST}`)).toBe("old archived copy");
    expect((await act({ action: "archive", path: "drafts/posts/x.md", sha: "0".repeat(40) })).status).toBe(400);
    expect((await act({ action: "republish", path: POST, sha: "0".repeat(40) })).status).toBe(400);
  });
});
