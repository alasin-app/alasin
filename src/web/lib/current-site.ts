// SPDX-License-Identifier: MIT
//
// The site the app is working on (#325). With one site, nothing changes: the
// app's paths and API paths are as they always were. In a deployment with
// sites/, the site is the first part of the app's paths (/<id>/posts …), its
// API routes are under /api/sites/<id>/, and what the app keeps on the device
// is kept per site. Switching sites loads the app again, so nothing of one
// site stays in memory for the other.

import type { Me } from "./api";

let multi = false;
let current: string | null = null;

/** Where the last site used is remembered, to open it again at /. */
const LAST_SITE = "alasin.site";

/** Sets the site from the signed-in user's sites and the address; returns its id, or null if one has to be chosen. */
export function chooseSite(me: Pick<Me, "multi" | "sites">, pathname: string): string | null {
  multi = me.multi;
  if (!multi) {
    current = null;
    return null;
  }
  const ids = me.sites.map((s) => s.id);
  const inPath = pathname.split("/")[1] ?? "";
  let last: string | null = null;
  try {
    last = localStorage.getItem(LAST_SITE);
  } catch {
    // Storage unavailable.
  }
  current = ids.includes(inPath) ? inPath : ids.length === 1 ? ids[0]! : null;
  if (!current && pathname === "/" && last && ids.includes(last)) current = last;
  if (current) {
    try {
      localStorage.setItem(LAST_SITE, current);
    } catch {
      // Storage unavailable.
    }
  }
  return current;
}

/** Whether the deployment has sites (and paths name them). */
export const hasSites = () => multi;

/** The current site's id, null with one site or before one is chosen. */
export const currentSite = () => current;

/** The start of the app's paths for the current site: "" with one site, "/<id>" with sites. */
export const sitePath = () => (multi && current ? `/${current}` : "");

/** App-wide API routes: not a site's. */
const APP_ROUTES = /^\/api\/(?:me(?:$|[?/])|avatar\/|sites\/)/;

/** An API path for the current site: /api/x → /api/sites/<id>/x with sites, as it is with one site. */
export function apiPath(path: string): string {
  if (!multi || !current || !path.startsWith("/api/") || APP_ROUTES.test(path)) return path;
  return `/api/sites/${encodeURIComponent(current)}${path.slice("/api".length)}`;
}

/** A key for what's kept on the device, per site with sites (as it was with one site). */
export const siteKey = (key: string) => (multi && current ? `${current}/${key}` : key);

/** Opens a site (or the site chooser, with null): loads the app again. */
export function openSite(id: string | null): void {
  try {
    if (id) localStorage.setItem(LAST_SITE, id);
    else localStorage.removeItem(LAST_SITE);
  } catch {
    // Storage unavailable.
  }
  location.assign(id ? `/${encodeURIComponent(id)}/` : "/");
}

/** A site's name for people: its address without https:// (example.com). */
export const siteLabel = (site: { url: string }) => {
  try {
    const u = new URL(site.url);
    return u.host + (u.pathname === "/" ? "" : u.pathname.replace(/\/$/, ""));
  } catch {
    return site.url;
  }
};
