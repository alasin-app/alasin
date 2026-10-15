// SPDX-License-Identifier: MIT
import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { vi } from "vitest";
import { createApp } from "../../src/worker/app";
import type { Env } from "../../src/worker/env";
import { APP_URL } from "../fixtures";
import { FakeRepo } from "./fake-repo";

const app = createApp();

export const fakeAssets: Fetcher = {
  fetch: async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === "/assets/app.js") return new Response("console.log(1)", { headers: { "Content-Type": "text/javascript" } });
    // Like Workers static assets in SPA mode: unknown paths get the app page.
    return new Response(
      '<!doctype html><html><head><title>x</title><meta name="theme-color" content="#000000"></head><body></body></html>',
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  },
  connect: () => {
    throw new Error("not supported");
  },
} as unknown as Fetcher;

let ipCounter = 0;
/** A fresh client IP, so rate limits from one test don't affect another. */
export function freshIp(): string {
  ipCounter++;
  return `198.51.100.${ipCounter % 250}`;
}

export async function call(
  path: string,
  init: RequestInit & { cookie?: string; ip?: string } = {},
  envOverrides: Partial<Env> = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("Cookie", init.cookie);
  headers.set("CF-Connecting-IP", init.ip ?? "192.0.2.1");
  const url = path.startsWith("http") ? path : `${APP_URL}${path}`;
  const ctx = createExecutionContext();
  const res = await app.fetch(new Request(url, { ...init, headers, redirect: "manual" }), { ...env, ASSETS: fakeAssets, ...envOverrides }, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

/** Headers for a valid state-changing request. */
export function mutating(cookie: string, body?: unknown): RequestInit & { cookie: string } {
  return {
    method: "POST",
    cookie,
    headers: { "X-Alasin": "1", Origin: APP_URL, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
}

export interface FakeGitHub {
  tokenRequests: Record<string, string>[];
  revoked: string[];
  /** Users by access token. */
  users: Map<string, { id: number; login: string; name: string | null }>;
  nextTokens: { access_token: string; expires_in?: number; refresh_token?: string; refresh_token_expires_in?: number }[];
  failRefresh: boolean;
  /** The site repository (owner/name/branch from the test config). */
  repo: FakeRepo;
}

/** Replaces global fetch with a fake GitHub (OAuth, /user, token revocation, avatars). */
export function fakeGitHub(): FakeGitHub {
  const gh: FakeGitHub = {
    tokenRequests: [],
    revoked: [],
    users: new Map(),
    nextTokens: [],
    failRefresh: false,
    repo: new FakeRepo("example-owner", "example-site", "main"),
  };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    if (url.href === "https://github.com/login/oauth/access_token" && req.method === "POST") {
      const body = (await req.json()) as Record<string, string>;
      gh.tokenRequests.push(body);
      if (body.grant_type === "refresh_token" && gh.failRefresh) return Response.json({ error: "bad_refresh_token" });
      const next = gh.nextTokens.shift();
      if (!next) return Response.json({ error: "bad_verification_code" });
      return Response.json({ token_type: "bearer", ...next });
    }
    if (url.href === "https://api.github.com/user") {
      const token = req.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
      const user = gh.users.get(token);
      return user ? Response.json(user) : new Response("{}", { status: 401 });
    }
    if (url.pathname.startsWith("/applications/") && req.method === "DELETE") {
      gh.revoked.push(((await req.json()) as { access_token: string }).access_token);
      return new Response(null, { status: 204 });
    }
    if (url.hostname === "avatars.githubusercontent.com") {
      return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { headers: { "Content-Type": "image/png", "Content-Length": "4" } });
    }
    const repoResponse = await gh.repo.handle(req);
    if (repoResponse) return repoResponse;
    throw new Error(`unexpected fetch in test: ${req.method} ${url.href}`);
  });
  return gh;
}

export function getSetCookies(res: Response): string[] {
  return res.headers.getSetCookie();
}

export function cookieValue(res: Response, name: string): string | undefined {
  for (const c of getSetCookies(res)) {
    const [pair] = c.split(";");
    const [k, v] = pair!.split("=");
    if (k === name) return v;
  }
  return undefined;
}

let tokenCounter = 0;

/** Runs the whole OAuth flow for `user` and returns the session cookie header value. */
export async function login(
  gh: FakeGitHub,
  user: { id: number; login: string },
  tokenOpts: { expires_in?: number; refresh_token?: string } = { expires_in: 28800, refresh_token: "ghr_testrefresh0000" },
): Promise<{ cookie: string; accessToken: string; callback: Response }> {
  const ip = freshIp();
  const start = await call("/auth/login", { ip });
  const authorize = new URL(start.headers.get("Location")!);
  const state = authorize.searchParams.get("state")!;
  const oauthCookie = cookieValue(start, "__Host-alasin_oauth")!;
  const accessToken = `ghu_testaccess${++tokenCounter}0000000`;
  gh.users.set(accessToken, { id: user.id, login: user.login, name: null });
  gh.nextTokens.push({ access_token: accessToken, ...tokenOpts });
  const callback = await call(`/auth/callback?code=testcode&state=${encodeURIComponent(state)}`, {
    ip,
    cookie: `__Host-alasin_oauth=${oauthCookie}`,
  });
  const session = cookieValue(callback, "__Host-alasin_session");
  return { cookie: session ? `__Host-alasin_session=${session}` : "", accessToken, callback };
}
