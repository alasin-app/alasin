// SPDX-License-Identifier: MIT
// A deployment with sites (#325): each site's routes under /api/sites/<id>/,
// its own buckets and edit locks, and write access per site.
import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDeployment, serializeDeployment } from "../../src/shared/config/deployment";
import { ALLOWED_USER, STRANGER, testConfig } from "../fixtures";
import { call, type FakeGitHub, fakeGitHub, login, mutating, useEnv } from "./helpers";
import { FakeRepo } from "./fake-repo";

const deployment = buildDeployment(testConfig as Record<string, unknown>, {
  one: {},
  two: { site: { url: "https://two.example.com" }, github: { repo: "second-site" }, media: { public_url: "https://media.two.example.com/" } },
});

let gh: FakeGitHub;
let second: FakeRepo;

beforeEach(() => {
  gh = fakeGitHub();
  second = new FakeRepo("example-owner", "second-site", "main");
  gh.others.push(second);
  useEnv({ ALASIN_CONFIG_JSON: serializeDeployment(deployment) });
});

afterEach(() => {
  useEnv({});
  vi.restoreAllMocks();
});

const photo = "2026/05/01/lake.jpg";

describe("a deployment with sites", () => {
  it("signs in someone who can write for one site, and lists only that one", async () => {
    second.collaborators.set(ALLOWED_USER.login, { permission: "write", id: ALLOWED_USER.id });
    const { cookie } = await login(gh, ALLOWED_USER, undefined, { writer: false });
    expect(cookie).not.toBe("");
    const me = (await (await call("/api/me", { cookie })).json()) as { multi: boolean; sites: { id: string; url: string }[] };
    expect(me.multi).toBe(true);
    expect(me.sites).toEqual([{ id: "two", url: "https://two.example.com" }]);
    expect((await call("/api/sites/two/locks", { cookie })).status).toBe(200);
    const other = await call("/api/sites/one/locks", { cookie });
    expect(other.status).toBe(403);
    expect(await other.json()).toMatchObject({ error: "not_allowed" });
  });

  it("refuses someone who can write for none", async () => {
    const { cookie, callback } = await login(gh, STRANGER, undefined, { writer: false });
    expect(cookie).toBe("");
    expect(callback.headers.get("Location")).toBe("/?login_error=not_allowed");
  });

  it("has no site routes outside /api/sites/<id>/, and no unknown sites", async () => {
    const { cookie } = await login(gh, ALLOWED_USER);
    const bare = await call("/api/locks", { cookie });
    expect(bare.status).toBe(404);
    expect(await bare.json()).toMatchObject({ error: "no_site" });
    expect((await call("/api/sites/three/locks", { cookie })).status).toBe(404);
  });

  it("gives a site found later at its first use", async () => {
    const { cookie } = await login(gh, ALLOWED_USER);
    expect((await call("/api/sites/two/locks", { cookie })).status).toBe(403);
    second.collaborators.set(ALLOWED_USER.login, { permission: "write", id: ALLOWED_USER.id });
    expect((await call("/api/sites/two/locks", { cookie })).status).toBe(200);
    const me = (await (await call("/api/me", { cookie })).json()) as { sites: { id: string }[] };
    expect(me.sites.map((s) => s.id)).toEqual(["one", "two"]);
  });

  it("lists a site the user can write for since signing in, when the app loads", async () => {
    const { cookie } = await login(gh, ALLOWED_USER);
    const sites = async () => ((await (await call("/api/me", { cookie })).json()) as { sites: { id: string }[] }).sites.map((s) => s.id);
    expect(await sites()).toEqual(["one"]);
    second.collaborators.set(ALLOWED_USER.login, { permission: "write", id: ALLOWED_USER.id });
    expect(await sites()).toEqual(["one", "two"]);
  });

  it("allows every site's photos in the Content-Security-Policy", async () => {
    const csp = (await call("/")).headers.get("Content-Security-Policy") ?? "";
    const imgSrc = csp.split("; ").find((d) => d.startsWith("img-src")) ?? "";
    expect(imgSrc).toContain("https://media.example.com");
    expect(imgSrc).toContain("https://media.two.example.com");
  });

  it("keeps each site's photos in its own bucket", async () => {
    second.collaborators.set(ALLOWED_USER.login, { permission: "write", id: ALLOWED_USER.id });
    const { cookie } = await login(gh, ALLOWED_USER);
    const media = env.MEDIA_ONE as R2Bucket;
    await media.put(photo, new Uint8Array([1]));
    const files = async (site: string) =>
      ((await (await call(`/api/sites/${site}/media/files?prefix=2026/05/`, { cookie })).json()) as { files: { key: string }[] }).files.map((f) => f.key);
    expect(await files("one")).toEqual([photo]);
    expect(await files("two")).toEqual([]);
    await media.delete(photo);
  });

  it("takes a site's photo uploads, which aren't JSON", async () => {
    const { cookie } = await login(gh, ALLOWED_USER);
    const draft = "01JABCDEFGHJKMNPQRSTVWXYZ0";
    const res = await call(`/api/sites/one/draft-media/${draft}/lake.jpg`, {
      method: "PUT",
      cookie,
      headers: { "X-Alasin": "1", Origin: "https://alasin.example.com", "Content-Type": "image/jpeg" },
      body: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    });
    expect(res.status).not.toBe(415);
    expect(res.status).not.toBe(403);
  });

  it("keeps each site's edit locks apart", async () => {
    second.collaborators.set(ALLOWED_USER.login, { permission: "write", id: ALLOWED_USER.id });
    const { cookie } = await login(gh, ALLOWED_USER);
    const key = "file:content/posts/hello.md";
    const one = await call("/api/sites/one/locks/acquire", mutating(cookie, { key, lockId: "lock-one-0001" }));
    expect(one.status).toBe(200);
    // The same path on the other site is another post: free.
    const two = await call("/api/sites/two/locks/acquire", mutating(cookie, { key, lockId: "lock-two-0001" }));
    expect(two.status).toBe(200);
    const status = (await (await call(`/api/sites/two/locks/status?key=${encodeURIComponent(key)}&lockId=lock-two-0001`, { cookie })).json()) as { state: string };
    expect(status.state).toBe("mine");
  });

  it("drops a site whose access is lost at the hourly check, and logs out when none is left", async () => {
    second.collaborators.set(ALLOWED_USER.login, { permission: "write", id: ALLOWED_USER.id });
    const { cookie } = await login(gh, ALLOWED_USER);
    gh.repo.collaborators.delete(ALLOWED_USER.login);
    let now = Date.now() + 61 * 60 * 1000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    expect((await call("/api/sites/one/locks", { cookie })).status).toBe(403);
    expect((await call("/api/sites/two/locks", { cookie })).status).toBe(200);
    second.collaborators.delete(ALLOWED_USER.login);
    now += 61 * 60 * 1000;
    const res = await call("/api/me", { cookie });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "not_allowed" });
  });
});
