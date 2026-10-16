// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseConfig } from "../../src/shared/config/schema";
import { ALLOWED_USER, STRANGER, testConfig } from "../fixtures";
import { call, type FakeGitHub, fakeGitHub, freshIp, login } from "./helpers";

let gh: FakeGitHub;

beforeEach(() => {
  gh = fakeGitHub();
});
afterEach(() => {
  vi.restoreAllMocks();
});

const asRepo = { ALASIN_CONFIG_JSON: JSON.stringify(parseConfig(testConfig)) };

/** Logs in like the helper, but under a given configuration and without granting access. */
async function signIn(user: { id: number; login: string }, envOverrides: Record<string, string>) {
  // Each sign-in from its own address, clear of the login rate limit.
  const ip = freshIp();
  const start = await call("/auth/login", { ip }, envOverrides);
  const state = new URL(start.headers.get("Location")!).searchParams.get("state")!;
  const oauth = start.headers.getSetCookie().find((c) => c.startsWith("__Host-alasin_oauth="))!.split(";")[0]!;
  const token = `ghu_access_${user.login}_000000`;
  gh.users.set(token, { id: user.id, login: user.login, name: null });
  gh.nextTokens.push({ access_token: token, expires_in: 28800, refresh_token: "ghr_testrefresh0000" });
  const res = await call(`/auth/callback?code=c&state=${encodeURIComponent(state)}`, { ip, cookie: oauth }, envOverrides);
  const session = res.headers.getSetCookie().find((c) => c.startsWith("__Host-alasin_session="))?.split(";")[0];
  return { location: res.headers.get("Location"), cookie: session ?? "" };
}

describe("access from the repository", () => {
  it("lets in anyone with write access to the site repository, and nobody else", async () => {
    gh.repo.collaborators.set(STRANGER.login, { permission: "maintain", id: STRANGER.id });
    expect((await signIn(STRANGER, asRepo)).location).toBe("/");
    gh.repo.collaborators.set("reader", { permission: "read", id: 777 });
    expect((await signIn({ login: "reader", id: 777 }, asRepo)).location).toBe("/?login_error=not_allowed");
    expect((await signIn({ login: "nobody", id: 778 }, asRepo)).location).toBe("/?login_error=not_allowed");
    // Refused sign-ins have their token revoked.
    expect(gh.revoked).toContain("ghu_access_nobody_000000");
  });

  it("logs out someone removed as a collaborator at the next hourly check", async () => {
    const { cookie } = await login(gh, ALLOWED_USER);
    expect((await call("/api/me", { cookie })).status).toBe(200);
    gh.repo.collaborators.delete(ALLOWED_USER.login);
    // Within the hour: still in.
    expect((await call("/api/me", { cookie })).status).toBe(200);
    const later = Date.now() + 61 * 60 * 1000;
    vi.spyOn(Date, "now").mockReturnValue(later);
    const res = await call("/api/me", { cookie });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "not_allowed" });
    // The session is gone for good.
    vi.spyOn(Date, "now").mockReturnValue(later + 1000);
    expect((await call("/api/me", { cookie })).status).toBe(401);
  });

  it("keeps the session when GitHub can't tell, and checks again later", async () => {
    const { cookie } = await login(gh, ALLOWED_USER);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 61 * 60 * 1000);
    const original = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      return url.includes("/permission") ? Promise.resolve(new Response("{}", { status: 502 })) : original(input, init);
    });
    expect((await call("/api/me", { cookie })).status).toBe(200);
  });
});
