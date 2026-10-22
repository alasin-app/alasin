// SPDX-License-Identifier: MIT
//
// Login with GitHub (GitHub App user-to-server OAuth, with PKCE and a
// single-use state) and logout.
//
//   GET  /auth/login     redirect to GitHub
//   GET  /auth/callback  code exchange, access to the sites, session
//   POST /auth/logout    end the session (CSRF-protected)

import { Hono, type Context } from "hono";
import type { AppEnv } from "../app";
import { clearCookie, OAUTH_COOKIE, readCookie, serializeCookie, SESSION_COOKIE } from "../lib/cookies";
import { randomToken, safeEqual, sha256Base64Url } from "../lib/crypto";
import { canWrite, forgetMembersWithout, repoPermission } from "../lib/access";
import { exchangeCode, getAuthenticatedUser, revokeToken } from "../lib/github";
import { log, logError } from "../lib/log";
import { createSession, destroySession, readSession } from "../session";

const STATE_TTL_SECONDS = 600;

/** Login error codes, shown by the SPA as `/?login_error=<code>`. */
export type LoginError = "state" | "denied" | "not_allowed" | "github" | "rate_limited";

const oauthStateKey = (stateHash: string) => `oauth:${stateHash}`;

function clientIp(c: Context<AppEnv>): string {
  return c.req.header("CF-Connecting-IP") ?? "unknown";
}

function redirectWithError(c: Context<AppEnv>, code: LoginError) {
  c.header("Set-Cookie", clearCookie(OAUTH_COOKIE), { append: true });
  return c.redirect(`/?login_error=${code}`, 302);
}

export const auth = new Hono<AppEnv>();

auth.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  return next();
});

auth.get("/login", async (c) => {
  const { success } = await c.env.RL_AUTH.limit({ key: `login:${clientIp(c)}` });
  if (!success) return redirectWithError(c, "rate_limited");
  const config = c.get("config");

  const state = randomToken(32);
  const verifier = randomToken(48);
  const challenge = await sha256Base64Url(verifier);
  // The state is stored server-side (single use) and bound to this browser by a cookie.
  await c.env.KV.put(oauthStateKey(await sha256Base64Url(state)), JSON.stringify({ verifier }), {
    expirationTtl: STATE_TTL_SECONDS,
  });
  c.header("Set-Cookie", serializeCookie(OAUTH_COOKIE, state, STATE_TTL_SECONDS));

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", config.github.client_id);
  url.searchParams.set("redirect_uri", `${config.app.url}/auth/callback`);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("allow_signup", "false");
  return c.redirect(url.toString(), 302);
});

auth.get("/callback", async (c) => {
  const { success } = await c.env.RL_AUTH.limit({ key: `callback:${clientIp(c)}` });
  if (!success) return redirectWithError(c, "rate_limited");
  const config = c.get("config");
  const rid = c.get("requestId");

  const state = c.req.query("state") ?? "";
  const cookieState = readCookie(c.req.header("Cookie"), OAUTH_COOKIE) ?? "";
  if (!state || !cookieState || !safeEqual(state, cookieState)) return redirectWithError(c, "state");

  const key = oauthStateKey(await sha256Base64Url(state));
  const stored = await c.env.KV.get(key);
  if (!stored) return redirectWithError(c, "state");
  await c.env.KV.delete(key); // single use

  if (c.req.query("error")) return redirectWithError(c, "denied");
  const code = c.req.query("code");
  if (!code) return redirectWithError(c, "state");

  let verifier: string;
  try {
    verifier = (JSON.parse(stored) as { verifier: string }).verifier;
  } catch {
    return redirectWithError(c, "state");
  }

  const credentials = { clientId: config.github.client_id, clientSecret: c.env.GITHUB_CLIENT_SECRET };
  let tokens, user;
  try {
    tokens = await exchangeCode({ ...credentials, code, redirectUri: `${config.app.url}/auth/callback`, codeVerifier: verifier });
    user = await getAuthenticatedUser(tokens.accessToken);
  } catch (err) {
    logError({ rid, event: "oauth_exchange_failed" }, err);
    return redirectWithError(c, "github");
  }

  // Who may log in: everyone with write access to a site's repository. They get the sites they can write for.
  const sites = c.get("deployment").sites;
  const permissions = await Promise.all(sites.map((s) => repoPermission(tokens.accessToken, s.config, user.login)));
  const allowed = sites.filter((_, i) => canWrite(permissions[i]!));
  if (!allowed.length) {
    const unknown = permissions.includes(null);
    log({ rid, event: unknown ? "login_access_unknown" : "login_rejected_not_allowed", uid: user.id });
    c.executionCtx.waitUntil(revokeToken({ ...credentials, accessToken: tokens.accessToken }).catch(() => undefined));
    return redirectWithError(c, unknown ? "github" : "not_allowed");
  }

  // A previous session in this browser is replaced (session fixation).
  const previous = await readSession(c);
  if (previous) await destroySession(c, previous);

  const cookie = await createSession(c.env, config, user, tokens, allowed.map((s) => s.id));
  await Promise.all(allowed.map((s) => forgetMembersWithout(c.env.KV, s.config, user.id)));
  log({ rid, event: "login", uid: user.id });
  c.header("Set-Cookie", clearCookie(OAUTH_COOKIE), { append: true });
  c.header("Set-Cookie", cookie, { append: true });
  return c.redirect("/", 302);
});

auth.post("/logout", async (c) => {
  const session = await readSession(c);
  if (session) {
    await destroySession(c, session);
    log({ rid: c.get("requestId"), event: "logout", uid: session.uid });
  }
  c.header("Set-Cookie", clearCookie(SESSION_COOKIE));
  c.header("Clear-Site-Data", '"cache", "storage"');
  return c.body(null, 204);
});
