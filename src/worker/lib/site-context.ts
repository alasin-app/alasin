// SPDX-License-Identifier: MIT
//
// The site of a request (#325). With sites/, a site's routes are under
// /api/sites/<id>/; with one site, under /api/ as they always were. This sets
// the site's configuration and buckets for the routes, and checks that the
// user can write to its repository: at first use, then about once an hour.
// Someone who loses write access to a site can't use it any more; when no
// site is left, they're logged out.

import type { Context, MiddlewareHandler } from "hono";
import type { SiteEntry } from "../../shared/config/deployment";
import type { AppEnv } from "../app";
import { clearCookie, SESSION_COOKIE } from "./cookies";
import { canWrite, type RepoPermission, repoPermission } from "./access";
import { log } from "./log";
import { destroySession, getUserToken, saveSiteAccess, SessionExpiredError, siteAccess } from "../session";

/** How often a session's write access to a site's repository is confirmed again. */
export const ACCESS_RECHECK = 60 * 60 * 1000;

/** The name of a site's edit locks (one Durable Object per site). */
export const locksName = (c: Context<AppEnv>) => (c.get("deployment").multi ? `locks:${c.get("site").id}` : "locks");

function bucket(c: Context<AppEnv>, binding: string): R2Bucket {
  const b = c.env[binding] as R2Bucket | undefined;
  if (!b) throw new Error(`The Worker has no ${binding} binding; deploy with \`npm run deploy\``);
  return b;
}

const unauthenticated = (c: Context<AppEnv>) => {
  c.header("Set-Cookie", clearCookie(SESSION_COOKIE));
  return c.json({ error: "unauthenticated", message: "Please log in." }, 401);
};

/** Sets the request's site; after requireSession. */
export function useSite(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const deployment = c.get("deployment");
    const id = c.req.param("site");
    // The routes mounted at /api/ see /api/sites/<id>/… too: those are the site's own.
    if (id === undefined && c.req.path.startsWith("/api/sites/")) return next();
    let entry: SiteEntry | undefined;
    if (id !== undefined) entry = deployment.multi ? deployment.sites.find((s) => s.id === id) : undefined;
    else if (!deployment.multi) entry = deployment.sites[0];
    if (!entry) {
      return c.json(
        deployment.multi && id === undefined
          ? { error: "no_site", message: "Choose a site: its routes are under /api/sites/<id>/." }
          : { error: "not_found", message: "No such site." },
        404,
      );
    }
    c.set("site", entry);
    c.set("config", entry.config);
    c.set("media", bucket(c, entry.media));
    c.set("drafts", bucket(c, entry.drafts));

    const refused = await checkAccess(c, entry, false);
    if (refused) return refused;
    return next();
  };
}

/**
 * Checks the session's write access to a site when it's due: at first use (a
 * site the user didn't have at sign-in), then about once an hour. Returns the
 * answer refusing the request, or null. `quiet`: a site that's lost or can't
 * be checked doesn't refuse the request (the user's other sites go on).
 */
async function checkAccess(c: Context<AppEnv>, entry: SiteEntry, quiet: boolean): Promise<Response | null> {
  const session = c.get("session");
  const checked = siteAccess(session, entry.id, c.get("deployment").multi);
  if (checked !== undefined && Date.now() - checked <= ACCESS_RECHECK) return null;
  if (checked === undefined && quiet) return null;
  let permission: RepoPermission | null;
  try {
    permission = await repoPermission(await getUserToken(c), entry.config, session.login);
  } catch (err) {
    if (!(err instanceof SessionExpiredError)) throw err;
    return unauthenticated(c);
  }
  const { owner, repo } = entry.config.github;
  if (permission === null) {
    // GitHub can't tell now: a site used before goes on, and is checked again later.
    return checked === undefined ? c.json({ error: "github", message: "GitHub didn't answer. Try again." }, 503) : null;
  }
  if (canWrite(permission)) {
    await saveSiteAccess(c, entry.id, Date.now());
    return null;
  }
  const left = await saveSiteAccess(c, entry.id, null);
  log({ rid: c.get("requestId"), event: "site_no_access", uid: session.uid, site: entry.id });
  if (!left) {
    await destroySession(c, c.get("session"));
    log({ rid: c.get("requestId"), event: "session_ended_no_access", uid: session.uid });
    c.header("Set-Cookie", clearCookie(SESSION_COOKIE));
    return c.json({ error: "not_allowed", message: `You no longer have write access to ${owner}/${repo}.` }, 401);
  }
  return quiet ? null : c.json({ error: "not_allowed", message: `You don't have write access to ${owner}/${repo}.` }, 403);
}

/** Checks the session's sites that are due (for /api/me): lost ones are dropped; with none left, the user is logged out. */
export function checkSites(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    for (const entry of c.get("deployment").sites) {
      const refused = await checkAccess(c, entry, true);
      if (refused) return refused;
    }
    return next();
  };
}
