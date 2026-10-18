// SPDX-License-Identifier: MIT
import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_URL, ALLOWED_USER } from "../fixtures";
import { call, type FakeGitHub, fakeGitHub, login } from "./helpers";

let gh: FakeGitHub;
beforeEach(() => {
  gh = fakeGitHub();
});
afterEach(() => {
  vi.restoreAllMocks();
});

function expectSecurityHeaders(res: Response) {
  const csp = res.headers.get("Content-Security-Policy")!;
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval';");
  expect(csp).not.toContain("unsafe-inline");
  // WebAssembly may be compiled; JavaScript eval may not.
  expect(csp).not.toMatch(/'unsafe-eval'/);
  expect(csp).toContain("img-src 'self' blob: data: https://media.example.com https://i.ytimg.com");
  expect(csp).toContain("connect-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("form-action 'self'");
  expect(res.headers.get("Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains");
  expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  expect(res.headers.get("Permissions-Policy")).toContain("geolocation=()");
  expect(res.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
}

describe("security headers", () => {
  it("are set on API responses, errors, auth redirects and static assets", async () => {
    const { cookie } = await login(gh, ALLOWED_USER);
    for (const res of [
      await call("/api/me", { cookie }),
      await call("/api/me"),
      await call("/api/nope", { cookie }),
      await call("/auth/login", { ip: "203.0.113.9" }),
      await call("/"),
      await call("/assets/app.js"),
      await call("/manifest.webmanifest"),
    ]) {
      expectSecurityHeaders(res);
    }
  });

  it("marks API responses as not cacheable", async () => {
    const { cookie } = await login(gh, ALLOWED_USER);
    expect((await call("/api/me", { cookie })).headers.get("Cache-Control")).toBe("no-store");
    expect((await call("/api/me")).headers.get("Cache-Control")).toBe("no-store");
  });

  it("answers a missing build file with 404, not the app page", async () => {
    const res = await call("/assets/index-old123.js");
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).not.toContain("text/html");
    expect((await call("/assets/app.js")).status).toBe(200);
  });

  it("gives each app page a one-time style nonce, never for scripts", async () => {
    const a = await call("/");
    const b = await call("/");
    const nonceOf = (csp: string) => /style-src 'self' 'nonce-([A-Za-z0-9_-]{22})'/.exec(csp)?.[1];
    const na = nonceOf(a.headers.get("Content-Security-Policy")!);
    expect(na).toBeTruthy();
    expect(nonceOf(b.headers.get("Content-Security-Policy")!)).not.toBe(na);
    expect(a.headers.get("Content-Security-Policy")).toMatch(/script-src 'self' 'wasm-unsafe-eval';/);
    expect(await a.text()).toContain(`<meta name="alasin:style-nonce" content="${na}">`);
    // API responses get no nonce.
    const api = await call("/api/me");
    expect(api.headers.get("Content-Security-Policy")).not.toContain("nonce-");
  });

  it("never lets the app page be stored", async () => {
    const res = await call("/drafts/post/01JA2B3C4D5E6F7G8H9JKMNPQR");
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("injects UI settings into the app shell as meta tags, without inline script", async () => {
    const html = await (await call("/")).text();
    expect(html).toContain('<meta name="alasin:name" content="Alasin">');
    expect(html).toContain('<meta name="alasin:environment" content="TEST">');
    expect(html).toContain("<title>Alasin (TEST)</title>");
    expect(html).not.toMatch(/<script(?![^>]*src=)/);
  });
});

describe("canonical origin", () => {
  it("redirects other hostnames to the configured app URL", async () => {
    const res = await call("https://alasin.example-account.workers.dev/some/path?x=1");
    expect(res.status).toBe(308);
    expect(res.headers.get("Location")).toBe(`${APP_URL}/some/path?x=1`);
    expectSecurityHeaders(res);
  });

  it("refuses state-changing requests on other hostnames", async () => {
    const res = await call("https://alasin.example-account.workers.dev/auth/logout", { method: "POST" });
    expect(res.status).toBe(421);
  });
});

describe("CSRF protection", () => {
  it("rejects state-changing requests without the custom header", async () => {
    const { cookie } = await login(gh, ALLOWED_USER);
    const res = await call("/auth/logout", { method: "POST", cookie, headers: { Origin: APP_URL } });
    expect(res.status).toBe(403);
    // The session survives the rejected request.
    expect((await call("/api/me", { cookie })).status).toBe(200);
  });

  it("rejects state-changing requests from another origin", async () => {
    const { cookie } = await login(gh, ALLOWED_USER);
    for (const origin of ["https://evil.example.net", "null", "https://alasin.example.com.evil.example.net"]) {
      const res = await call("/auth/logout", { method: "POST", cookie, headers: { "X-Alasin": "1", Origin: origin } });
      expect(res.status).toBe(403);
    }
    const noOrigin = await call("/auth/logout", { method: "POST", cookie, headers: { "X-Alasin": "1" } });
    expect(noOrigin.status).toBe(403);
    expect((await call("/api/me", { cookie })).status).toBe(200);
  });

  it("rejects non-JSON bodies on API routes", async () => {
    const { cookie } = await login(gh, ALLOWED_USER);
    const res = await call("/api/me", {
      method: "POST",
      cookie,
      headers: { "X-Alasin": "1", Origin: APP_URL, "Content-Type": "application/x-www-form-urlencoded" },
      body: "a=1",
    });
    expect(res.status).toBe(415);
  });

  it("checks CSRF before authentication", async () => {
    const res = await call("/api/anything", { method: "DELETE" });
    expect(res.status).toBe(403);
  });
});

describe("GitHub token refresh", () => {
  // No milestone-1 route needs the user's GitHub token yet, so exercise
  // getUserToken through a minimal app built from the real session middleware.
  async function tokenApp() {
    const { Hono } = await import("hono");
    const { getUserToken, requireSession, SessionExpiredError } = await import("../../src/worker/session");
    const { loadConfig } = await import("../../src/worker/config");
    const app = new Hono<import("../../src/worker/app").AppEnv>();
    app.use("*", async (c, next) => {
      c.set("config", loadConfig(c.env.ALASIN_CONFIG_JSON));
      c.set("requestId", "test");
      await next();
    });
    app.use("*", requireSession());
    app.get("*", async (c) => c.text(await getUserToken(c)));
    app.onError((err, c) => (err instanceof SessionExpiredError ? c.text("expired", 401) : c.text("error", 500)));
    return async (cookie: string) => {
      const ctx = createExecutionContext();
      const res = await app.fetch(new Request(`${APP_URL}/token`, { headers: { Cookie: cookie } }), env, ctx);
      await waitOnExecutionContext(ctx);
      return res;
    };
  }

  it("returns the current token while it is valid", async () => {
    const getToken = await tokenApp();
    const { cookie, accessToken } = await login(gh, ALLOWED_USER);
    expect(await (await getToken(cookie)).text()).toBe(accessToken);
  });

  it("refreshes an access token that is about to expire", async () => {
    const getToken = await tokenApp();
    const { cookie } = await login(gh, ALLOWED_USER, { expires_in: 60, refresh_token: "ghr_refreshme000000" });
    gh.nextTokens.push({ access_token: "ghu_fresh0000000000", expires_in: 28800, refresh_token: "ghr_rotated000000" });
    expect(await (await getToken(cookie)).text()).toBe("ghu_fresh0000000000");
    expect(gh.tokenRequests.at(-1)).toMatchObject({ grant_type: "refresh_token", refresh_token: "ghr_refreshme000000" });
    // The refreshed token is stored: the next request doesn't refresh again.
    const before = gh.tokenRequests.length;
    expect(await (await getToken(cookie)).text()).toBe("ghu_fresh0000000000");
    expect(gh.tokenRequests).toHaveLength(before);
  });

  it("ends the session when the refresh fails", async () => {
    const getToken = await tokenApp();
    const { cookie } = await login(gh, ALLOWED_USER, { expires_in: 60, refresh_token: "ghr_willfail00000" });
    gh.failRefresh = true;
    expect((await getToken(cookie)).status).toBe(401);
    expect((await call("/api/me", { cookie })).status).toBe(401);
  });
});

describe("avatar proxy", () => {
  it("only accepts numeric IDs and requires a session", async () => {
    const { cookie } = await login(gh, ALLOWED_USER);
    expect((await call("/api/avatar/583231", { cookie })).status).toBe(200);
    expect((await call("/api/avatar/583231")).status).toBe(401);
    expect((await call("/api/avatar/..%2F..%2Fevil", { cookie })).status).toBe(404);
    expect((await call("/api/avatar/abc", { cookie })).status).toBe(404);
  });

  it("is kept only minutes, and checked again with GitHub's ETag", async () => {
    const { cookie } = await login(gh, ALLOWED_USER);
    const res = await call("/api/avatar/583231?s=40", { cookie });
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=300");
    expect(res.headers.get("ETag")).toBe('"avatar-v1"');
    expect((await call("/api/avatar/583231?s=40", { cookie, headers: { "If-None-Match": '"avatar-v1"' } })).status).toBe(304);
    expect((await call("/api/avatar/583231?s=40", { cookie, headers: { "If-None-Match": '"avatar-v0"' } })).status).toBe(200);
  });
});
