// SPDX-License-Identifier: MIT
import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseConfig } from "../../src/shared/config/schema";
import { sha256Base64Url } from "../../src/worker/lib/crypto";
import { ALLOWED_USER, APP_URL, STRANGER, testConfig } from "../fixtures";
import { call, cookieValue, type FakeGitHub, fakeGitHub, freshIp, getSetCookies, login, mutating } from "./helpers";

let gh: FakeGitHub;
beforeEach(() => {
  gh = fakeGitHub();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("login", () => {
  it("redirects to GitHub with a random state and a PKCE S256 challenge", async () => {
    const res = await call("/auth/login", { ip: freshIp() });
    expect(res.status).toBe(302);
    const url = new URL(res.headers.get("Location")!);
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("Iv23liEXAMPLE");
    expect(url.searchParams.get("redirect_uri")).toBe(`${APP_URL}/auth/callback`);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const cookie = getSetCookies(res).find((c) => c.startsWith("__Host-alasin_oauth="))!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it("logs in an allowed user, sends the PKCE verifier and sets a hardened session cookie", async () => {
    const { cookie, callback } = await login(gh, ALLOWED_USER);
    expect(callback.status).toBe(302);
    expect(callback.headers.get("Location")).toBe("/");
    const set = getSetCookies(callback).find((c) => c.startsWith("__Host-alasin_session="))!;
    for (const attr of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/"]) expect(set).toContain(attr);
    expect(set).not.toMatch(/Domain=/i);

    // The verifier sent to GitHub hashes to the challenge sent to the browser.
    const exchange = gh.tokenRequests.at(-1)!;
    expect(exchange.code_verifier).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(exchange.client_secret).toBe("test-client-secret");

    const me = await call("/api/me", { cookie });
    expect(me.status).toBe(200);
    const body = (await me.json()) as { user: { id: number; login: string }; version: string; environment: string };
    expect(body.user).toMatchObject({ id: ALLOWED_USER.id, login: ALLOWED_USER.login });
    expect(body.version).toBe("0.0.0-test");
    expect(body.environment).toBe("TEST");
    // The test config records no rotations, so both reminders are due.
    expect((body as unknown as { housekeeping: { item: string }[] }).housekeeping.map((h) => h.item)).toEqual([
      "session_keys",
      "github_secrets",
    ]);
    // Tokens never reach the browser.
    expect(JSON.stringify(body)).not.toContain("ghu_");
    expect(set).not.toContain("ghu_");
  });

  it("checks the PKCE challenge matches the verifier", async () => {
    const ip = freshIp();
    const start = await call("/auth/login", { ip });
    const authorize = new URL(start.headers.get("Location")!);
    gh.nextTokens.push({ access_token: "ghu_pkcecheck000000" });
    gh.users.set("ghu_pkcecheck000000", { ...ALLOWED_USER, name: null });
    await call(`/auth/callback?code=c&state=${authorize.searchParams.get("state")}`, {
      ip,
      cookie: `__Host-alasin_oauth=${cookieValue(start, "__Host-alasin_oauth")}`,
    });
    const verifier = gh.tokenRequests.at(-1)!.code_verifier!;
    expect(await sha256Base64Url(verifier)).toBe(authorize.searchParams.get("code_challenge"));
  });

  it("rejects a valid GitHub login that is not on the allowlist, and revokes its token", async () => {
    const { cookie, callback, accessToken } = await login(gh, STRANGER);
    expect(callback.status).toBe(302);
    expect(callback.headers.get("Location")).toBe("/?login_error=not_allowed");
    expect(cookie).toBe("");
    expect(gh.revoked).toContain(accessToken);
  });

  it("rejects a forged state", async () => {
    const ip = freshIp();
    const start = await call("/auth/login", { ip });
    const oauthCookie = cookieValue(start, "__Host-alasin_oauth")!;
    const forged = "A".repeat(43);
    const res = await call(`/auth/callback?code=c&state=${forged}`, { ip, cookie: `__Host-alasin_oauth=${oauthCookie}` });
    expect(res.headers.get("Location")).toBe("/?login_error=state");
    expect(gh.tokenRequests).toHaveLength(0);
  });

  it("rejects a state that matches a forged cookie but was never issued", async () => {
    const forged = "B".repeat(43);
    const res = await call(`/auth/callback?code=c&state=${forged}`, { ip: freshIp(), cookie: `__Host-alasin_oauth=${forged}` });
    expect(res.headers.get("Location")).toBe("/?login_error=state");
    expect(gh.tokenRequests).toHaveLength(0);
  });

  it("rejects a callback without the browser's state cookie (login CSRF)", async () => {
    const start = await call("/auth/login", { ip: freshIp() });
    const state = new URL(start.headers.get("Location")!).searchParams.get("state")!;
    const res = await call(`/auth/callback?code=c&state=${state}`, { ip: freshIp() });
    expect(res.headers.get("Location")).toBe("/?login_error=state");
  });

  it("accepts each state only once", async () => {
    const ip = freshIp();
    const start = await call("/auth/login", { ip });
    const state = new URL(start.headers.get("Location")!).searchParams.get("state")!;
    const cookie = `__Host-alasin_oauth=${cookieValue(start, "__Host-alasin_oauth")}`;
    gh.nextTokens.push({ access_token: "ghu_once0000000000" });
    gh.users.set("ghu_once0000000000", { ...ALLOWED_USER, name: null });
    gh.repo.collaborators.set(ALLOWED_USER.login, { permission: "write", id: ALLOWED_USER.id });
    const first = await call(`/auth/callback?code=c&state=${state}`, { ip, cookie });
    expect(first.headers.get("Location")).toBe("/");
    const replay = await call(`/auth/callback?code=c&state=${state}`, { ip, cookie });
    expect(replay.headers.get("Location")).toBe("/?login_error=state");
  });

  it("reports a cancelled authorization as denied", async () => {
    const ip = freshIp();
    const start = await call("/auth/login", { ip });
    const state = new URL(start.headers.get("Location")!).searchParams.get("state")!;
    const res = await call(`/auth/callback?error=access_denied&state=${state}`, {
      ip,
      cookie: `__Host-alasin_oauth=${cookieValue(start, "__Host-alasin_oauth")}`,
    });
    expect(res.headers.get("Location")).toBe("/?login_error=denied");
  });

  it("rate-limits login attempts per client IP", async () => {
    const ip = freshIp();
    const statuses: (string | null)[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await call("/auth/login", { ip })).headers.get("Location"));
    expect(statuses.slice(0, 5).every((l) => l?.startsWith("https://github.com/"))).toBe(true);
    expect(statuses.at(-1)).toBe("/?login_error=rate_limited");
  });
});

describe("sessions", () => {
  it("rejects API requests without a session", async () => {
    const res = await call("/api/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "unauthenticated" });
  });

  it("rejects a tampered session cookie", async () => {
    const { cookie } = await login(gh, ALLOWED_USER);
    const value = cookie.split("=")[1]!;
    const flipped = value.slice(0, 20) + (value[20] === "A" ? "B" : "A") + value.slice(21);
    expect((await call("/api/me", { cookie: `__Host-alasin_session=${flipped}` })).status).toBe(401);
    expect((await call("/api/me", { cookie: "__Host-alasin_session=garbage" })).status).toBe(401);
  });

  it("invalidates the session server-side on logout", async () => {
    const { cookie, accessToken } = await login(gh, ALLOWED_USER);
    const res = await call("/auth/logout", mutating(cookie));
    expect(res.status).toBe(204);
    expect(getSetCookies(res).some((c) => c.startsWith("__Host-alasin_session=;") && c.includes("Max-Age=0"))).toBe(true);
    // Replaying the old cookie no longer works.
    expect((await call("/api/me", { cookie })).status).toBe(401);
    expect(gh.revoked).toContain(accessToken);
  });

  it("re-checks the allowlist on every request", async () => {
    const { cookie } = await login(gh, ALLOWED_USER);
    expect((await call("/api/me", { cookie })).status).toBe(200);
    const without = parseConfig({ ...testConfig, users: { allow: [{ login: "hubot", id: 480938 }] } });
    const res = await call("/api/me", { cookie }, { ALASIN_CONFIG_JSON: JSON.stringify(without) });
    expect(res.status).toBe(401);
  });

  it("expires idle sessions and sessions past their maximum age", async () => {
    const { cookie } = await login(gh, ALLOWED_USER);
    const keys = (await env.KV.list({ prefix: "session:" })).keys;
    const day = 86400_000;
    for (const { name } of keys) {
      const rec = JSON.parse((await env.KV.get(name))!);
      await env.KV.put(name, JSON.stringify({ ...rec, lastSeenAt: Date.now() - 8 * day }));
    }
    expect((await call("/api/me", { cookie })).status).toBe(401);

    const second = await login(gh, ALLOWED_USER);
    for (const { name } of (await env.KV.list({ prefix: "session:" })).keys) {
      const rec = JSON.parse((await env.KV.get(name))!);
      await env.KV.put(name, JSON.stringify({ ...rec, createdAt: Date.now() - 31 * day }));
    }
    expect((await call("/api/me", { cookie: second.cookie })).status).toBe(401);
  });

  it("stores GitHub tokens encrypted at rest", async () => {
    const { accessToken } = await login(gh, ALLOWED_USER);
    for (const { name } of (await env.KV.list()).keys) {
      expect(await env.KV.get(name)).not.toContain(accessToken);
      expect(await env.KV.get(name)).not.toContain("ghr_");
    }
  });
});
