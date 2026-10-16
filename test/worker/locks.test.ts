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
});
afterEach(() => {
  vi.restoreAllMocks();
});

const post = (action: string, body: Record<string, unknown>) => call(`/api/locks/${action}`, mutating(cookie, body));

describe("edit locks", () => {
  it("gives the lock to the first editor and tells the second who has it", async () => {
    const key = `draft:${ulid()}`;
    const a = await post("acquire", { key, lockId: "tab-aaaaaaaa" });
    expect(a.status).toBe(200);
    expect(await a.json()).toMatchObject({ held: true });

    const b = await post("acquire", { key, lockId: "tab-bbbbbbbb" });
    expect(b.status).toBe(409);
    expect(await b.json()).toMatchObject({ held: false, holder: { uid: ALLOWED_USER.id, login: ALLOWED_USER.login } });

    // The holder can renew and re-acquire.
    expect((await post("renew", { key, lockId: "tab-aaaaaaaa" })).status).toBe(200);
    expect((await post("acquire", { key, lockId: "tab-aaaaaaaa" })).status).toBe(200);
  });

  it("lets another editor take over; the first then learns it lost the lock", async () => {
    const key = "file:content/posts/2026/trip.md";
    await post("acquire", { key, lockId: "tab-aaaaaaaa" });
    expect((await post("acquire", { key, lockId: "tab-bbbbbbbb", takeOver: true })).status).toBe(200);
    const renew = await post("renew", { key, lockId: "tab-aaaaaaaa" });
    expect(renew.status).toBe(409);
    expect(await renew.json()).toMatchObject({ held: false });
  });

  it("frees the lock on release, and lists the locks held", async () => {
    const key = `draft:${ulid()}`;
    await post("acquire", { key, lockId: "tab-aaaaaaaa" });
    const listed = (await (await call("/api/locks", { cookie })).json()) as { locks: { key: string; login: string }[] };
    expect(listed.locks.find((l) => l.key === key)).toMatchObject({ login: ALLOWED_USER.login });

    // Only the holder can release it.
    await post("release", { key, lockId: "tab-bbbbbbbb" });
    expect((await post("acquire", { key, lockId: "tab-bbbbbbbb" })).status).toBe(409);
    await post("release", { key, lockId: "tab-aaaaaaaa" });
    expect((await post("acquire", { key, lockId: "tab-bbbbbbbb" })).status).toBe(200);
  });

  it("tells an editor cheaply whether the lock is its own, free or someone else's", async () => {
    const key = `draft:${ulid()}`;
    const status = async (lockId: string) => (await call(`/api/locks/status?key=${encodeURIComponent(key)}&lockId=${lockId}`, { cookie })).json();
    expect(await status("tab-aaaaaaaa")).toEqual({ state: "free" });
    await post("acquire", { key, lockId: "tab-aaaaaaaa" });
    expect(await status("tab-aaaaaaaa")).toEqual({ state: "mine" });
    expect(await status("tab-bbbbbbbb")).toMatchObject({ state: "other", holder: { login: ALLOWED_USER.login } });
    expect(JSON.stringify(await status("tab-bbbbbbbb"))).not.toContain("tab-aaaaaaaa");
  });

  it("expires a lock that isn't renewed", async () => {
    const stub = env.LOCKS.get(env.LOCKS.idFromName("locks"));
    const key = `draft:${ulid()}`;
    const who = { uid: 1, login: "a", name: null };
    const now = Date.now();
    expect(await stub.acquire(key, "tab-aaaaaaaa", who, 180_000, false, now)).toMatchObject({ held: true });
    expect(await stub.acquire(key, "tab-bbbbbbbb", who, 180_000, false, now + 179_000)).toMatchObject({ held: false });
    expect(await stub.acquire(key, "tab-bbbbbbbb", who, 180_000, false, now + 181_000)).toMatchObject({ held: true });
    // The first editor, back after its lease ran out, finds the lock taken.
    expect(await stub.renew(key, "tab-aaaaaaaa", who, 180_000, now + 182_000)).toMatchObject({ held: false });
  });

  it("accepts only keys of drafts and published posts and pages, with the CSRF header", async () => {
    expect((await post("acquire", { key: "file:wrangler.toml", lockId: "tab-aaaaaaaa" })).status).toBe(400);
    expect((await post("acquire", { key: "file:content/posts/../x.md", lockId: "tab-aaaaaaaa" })).status).toBe(400);
    expect((await post("acquire", { key: "draft:nope", lockId: "tab-aaaaaaaa" })).status).toBe(400);
    const res = await call("/api/locks/acquire", { method: "POST", cookie, headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(res.status).toBe(403);
  });
});
