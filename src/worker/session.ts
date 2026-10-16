// SPDX-License-Identifier: MIT
//
// Sessions.
//
// The browser holds only an AES-GCM-encrypted `__Host-` cookie with a random
// session ID. The session record (user, timestamps, and the GitHub tokens,
// encrypted again with a separate key) lives server-side in KV, so logout
// deletes it and tokens never reach the browser.

import type { Context, MiddlewareHandler } from "hono";
import { z } from "zod";
import type { AlasinConfig } from "../shared/config/schema";
import type { AppEnv } from "./app";
import { isAllowed } from "./config";
import type { Env } from "./env";
import { clearCookie, readCookie, serializeCookie, SESSION_COOKIE } from "./lib/cookies";
import { importAesKey, open, randomToken, seal } from "./lib/crypto";
import { refreshTokens, revokeToken, type GitHubUser, type UserTokens } from "./lib/github";
import { log, logError } from "./lib/log";
import { canWrite, type RepoPermission, repoPermission } from "./lib/access";

const COOKIE_CONTEXT = "alasin/session-cookie/v1";
const DAY = 24 * 60 * 60 * 1000;
/** lastSeenAt is written at most this often, to stay within KV's daily write quota. */
const TOUCH_INTERVAL = 60 * 60 * 1000;
/** Refresh the GitHub access token when it has less than this left. */
const REFRESH_MARGIN = 5 * 60 * 1000;

const cookiePayload = z.object({ v: z.literal(1), sid: z.string().regex(/^[A-Za-z0-9_-]{43}$/), uid: z.number().int() });

const sessionRecord = z.object({
  uid: z.number().int(),
  login: z.string(),
  name: z.string().nullable(),
  createdAt: z.number(),
  lastSeenAt: z.number(),
  /** When write access to the site repository was last confirmed (absent in older sessions). */
  accessCheckedAt: z.number().optional(),
  /** UserTokens as JSON, sealed with TOKEN_KEY and bound to the session ID. */
  tokens: z.string(),
});

export type SessionRecord = z.infer<typeof sessionRecord>;

export interface Session extends SessionRecord {
  sid: string;
}

const kvKey = (sid: string) => `session:${sid}`;
const tokenContext = (sid: string) => `alasin/github-tokens/v1/${sid}`;

function maxAgeMs(config: AlasinConfig) {
  return config.security.session_max_days * DAY;
}

async function writeRecord(env: Env, config: AlasinConfig, sid: string, record: SessionRecord): Promise<void> {
  const remaining = record.createdAt + maxAgeMs(config) - Date.now();
  // KV requires a TTL of at least 60 s.
  await env.KV.put(kvKey(sid), JSON.stringify(record), { expirationTtl: Math.max(60, Math.ceil(remaining / 1000)) });
}

async function sealTokens(env: Env, sid: string, tokens: UserTokens): Promise<string> {
  return seal(await importAesKey("TOKEN_KEY", env.TOKEN_KEY), JSON.stringify(tokens), tokenContext(sid));
}

/** Creates a session and returns its Set-Cookie header value. */
export async function createSession(env: Env, config: AlasinConfig, user: GitHubUser, tokens: UserTokens): Promise<string> {
  const sid = randomToken(32);
  const now = Date.now();
  await writeRecord(env, config, sid, {
    uid: user.id,
    login: user.login,
    name: user.name ?? null,
    createdAt: now,
    lastSeenAt: now,
    accessCheckedAt: now,
    tokens: await sealTokens(env, sid, tokens),
  });
  const cookieKey = await importAesKey("SESSION_KEY", env.SESSION_KEY);
  const value = await seal(cookieKey, JSON.stringify({ v: 1, sid, uid: user.id }), COOKIE_CONTEXT);
  return serializeCookie(SESSION_COOKIE, value, maxAgeMs(config) / 1000);
}

/** Reads and checks the session for a request. Returns null if there is no valid session. */
export async function readSession(c: Context<AppEnv>): Promise<Session | null> {
  const value = readCookie(c.req.header("Cookie"), SESSION_COOKIE);
  if (!value) return null;
  const config = c.get("config");
  const plaintext = await open(await importAesKey("SESSION_KEY", c.env.SESSION_KEY), value, COOKIE_CONTEXT);
  if (!plaintext) return null;
  let payload: z.infer<typeof cookiePayload>;
  try {
    payload = cookiePayload.parse(JSON.parse(plaintext));
  } catch {
    return null;
  }
  const stored = await c.env.KV.get(kvKey(payload.sid));
  if (!stored) return null;
  const record = sessionRecord.safeParse(JSON.parse(stored));
  if (!record.success || record.data.uid !== payload.uid) return null;

  const now = Date.now();
  const s = record.data;
  const expired =
    now - s.createdAt > maxAgeMs(config) || now - s.lastSeenAt > config.security.session_idle_days * DAY;
  // The allowlist is re-checked on every request, so removing a user takes effect immediately.
  if (expired || !isAllowed(config, s.uid)) {
    c.executionCtx.waitUntil(c.env.KV.delete(kvKey(payload.sid)));
    return null;
  }
  if (now - s.lastSeenAt > TOUCH_INTERVAL) {
    c.executionCtx.waitUntil(writeRecord(c.env, config, payload.sid, { ...s, lastSeenAt: now }));
  }
  return { ...s, sid: payload.sid };
}

/** Deletes the session server-side and revokes its GitHub token (best effort). */
export async function destroySession(c: Context<AppEnv>, session: Session): Promise<void> {
  await c.env.KV.delete(kvKey(session.sid));
  const tokens = await unsealTokens(c.env, session);
  if (tokens) {
    const config = c.get("config");
    c.executionCtx.waitUntil(
      revokeToken({ clientId: config.github.client_id, clientSecret: c.env.GITHUB_CLIENT_SECRET, accessToken: tokens.accessToken }).catch(
        () => undefined,
      ),
    );
  }
}

async function unsealTokens(env: Env, session: Session): Promise<UserTokens | null> {
  const json = await open(await importAesKey("TOKEN_KEY", env.TOKEN_KEY), session.tokens, tokenContext(session.sid));
  return json ? (JSON.parse(json) as UserTokens) : null;
}

export class SessionExpiredError extends Error {
  constructor() {
    super("GitHub authorization expired; log in again");
    this.name = "SessionExpiredError";
  }
}

/**
 * Returns a valid GitHub user-to-server token for the session, refreshing it
 * if it is about to expire. Throws SessionExpiredError (and ends the session)
 * if it can't be refreshed.
 */
export async function getUserToken(c: Context<AppEnv>): Promise<string> {
  const session = c.get("session");
  const tokens = await unsealTokens(c.env, session);
  if (!tokens) throw await endSession(c, session);
  if (!tokens.accessExpiresAt || tokens.accessExpiresAt - Date.now() > REFRESH_MARGIN) return tokens.accessToken;
  if (!tokens.refreshToken || (tokens.refreshExpiresAt && tokens.refreshExpiresAt < Date.now())) {
    throw await endSession(c, session);
  }
  const config = c.get("config");
  try {
    const fresh = await refreshTokens({
      clientId: config.github.client_id,
      clientSecret: c.env.GITHUB_CLIENT_SECRET,
      refreshToken: tokens.refreshToken,
    });
    const { sid, ...rest } = session;
    const record: SessionRecord = { ...rest, tokens: await sealTokens(c.env, sid, fresh) };
    await writeRecord(c.env, config, sid, record);
    c.set("session", { ...session, tokens: record.tokens });
    return fresh.accessToken;
  } catch (err) {
    logError({ rid: c.get("requestId"), event: "token_refresh_failed", uid: session.uid }, err);
    throw await endSession(c, session);
  }
}

async function endSession(c: Context<AppEnv>, session: Session): Promise<SessionExpiredError> {
  await c.env.KV.delete(kvKey(session.sid));
  return new SessionExpiredError();
}

/** How often a session's write access to the site repository is confirmed again. */
const ACCESS_RECHECK = 60 * 60 * 1000;

/**
 * Rejects requests without a valid session with 401. About once an hour, it
 * also checks that the user still has write access to the site repository:
 * someone removed as a collaborator on GitHub is logged out. If GitHub can't
 * tell (e.g. it's down), the session goes on and the check is tried again.
 */
export function requireSession(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const session = await readSession(c);
    if (!session) {
      c.header("Set-Cookie", clearCookie(SESSION_COOKIE));
      return c.json({ error: "unauthenticated", message: "Please log in." }, 401);
    }
    c.set("session", session);
    if (Date.now() - (session.accessCheckedAt ?? 0) > ACCESS_RECHECK) {
      const config = c.get("config");
      let permission: RepoPermission | null;
      try {
        permission = await repoPermission(await getUserToken(c), config, session.login);
      } catch (err) {
        if (!(err instanceof SessionExpiredError)) throw err;
        c.header("Set-Cookie", clearCookie(SESSION_COOKIE));
        return c.json({ error: "unauthenticated", message: "Please log in." }, 401);
      }
      if (permission !== null && !canWrite(permission)) {
        await destroySession(c, session);
        log({ rid: c.get("requestId"), event: "session_ended_no_access", uid: session.uid });
        c.header("Set-Cookie", clearCookie(SESSION_COOKIE));
        return c.json({ error: "not_allowed", message: `You no longer have write access to ${config.github.owner}/${config.github.repo}.` }, 401);
      }
      if (permission !== null) {
        // The session as it is now (getUserToken may have refreshed its tokens).
        const { sid, ...rest } = c.get("session");
        const checked = { ...rest, accessCheckedAt: Date.now() };
        c.set("session", { ...checked, sid });
        c.executionCtx.waitUntil(writeRecord(c.env, config, sid, checked));
      }
    }
    return next();
  };
}
