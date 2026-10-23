// SPDX-License-Identifier: MIT
// A small History API router for the app's sections and the editor. With
// sites, every path starts with the site (/<id>/posts …; see current-site.ts).

import { useEffect, useState } from "preact/hooks";
import { isUlid } from "../../shared/ulid";
import { sitePath } from "./current-site";
import { isReturnPath } from "./list-params";

export type Section = "home" | "pages" | "posts" | "drafts" | "categories" | "media" | "bin" | "users" | "more";
export type DraftKind = "post" | "page";

export type Route = { name: Section } | { name: "editor"; type: DraftKind; id: string } | { name: "file"; path: string };

const SECTION_PATHS: Record<Section, string> = {
  home: "/",
  pages: "/pages",
  posts: "/posts",
  drafts: "/drafts",
  categories: "/categories",
  media: "/media",
  bin: "/bin",
  users: "/users",
  more: "/more",
};

export function parseRoute(pathname: string): Route {
  const base = sitePath();
  const inSite = base && (pathname === base || pathname.startsWith(`${base}/`)) ? pathname.slice(base.length) : pathname;
  const path = inSite.replace(/\/+$/, "") || "/";
  const m = /^\/drafts\/(post|page)\/([0-9A-Z]{26})$/.exec(path);
  if (m && isUlid(m[2]!)) return { name: "editor", type: m[1] as DraftKind, id: m[2]! };
  // A published post or page: /edit/<repository path>
  if (path.startsWith("/edit/")) {
    try {
      const file = path.slice("/edit/".length).split("/").map(decodeURIComponent).join("/");
      if (file.endsWith(".md") && !file.split("/").includes("..")) return { name: "file", path: file };
    } catch {
      // Malformed address: the home section.
    }
  }
  const section = (Object.entries(SECTION_PATHS) as [Section, string][]).find(([, p]) => p === path);
  return { name: section?.[0] ?? "home" };
}

export function hrefFor(route: Route): string {
  const base = sitePath();
  if (route.name === "editor") return `${base}/drafts/${route.type}/${route.id}`;
  if (route.name === "file") return `${base}/edit/${route.path.split("/").map(encodeURIComponent).join("/")}`;
  return route.name === "home" && base ? `${base}/` : `${base}${SECTION_PATHS[route.name]}`;
}

const listeners = new Set<() => void>();
/** Listeners to the address's query only (a list's filters), which doesn't change the route. */
const searchListeners = new Set<() => void>();
window.addEventListener("popstate", () => {
  listeners.forEach((l) => l());
  searchListeners.forEach((l) => l());
});

export function navigate(route: Route, opts: { replace?: boolean } = {}): void {
  const href = hrefFor(route);
  if (location.pathname === href) return;
  if (opts.replace) history.replaceState(null, "", href);
  else history.pushState(null, "", href);
  listeners.forEach((l) => l());
  window.scrollTo({ top: 0 });
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.pathname));
  useEffect(() => {
    const l = () => setRoute(parseRoute(location.pathname));
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return route;
}

/** The address's query ("?…" or ""), updated when it changes. */
export function useSearch(): string {
  const [search, setSearch] = useState(location.search);
  useEffect(() => {
    const l = () => setSearch(location.search);
    searchListeners.add(l);
    return () => void searchListeners.delete(l);
  }, []);
  return search;
}

/** Replaces the address's query, keeping the route and the history entry. */
export function replaceSearch(search: string): void {
  if (search === location.search) return;
  history.replaceState(null, "", `${location.pathname}${search}${location.hash}`);
  searchListeners.forEach((l) => l());
}

/** Where the address asked for before signing in is kept, to open it again afterwards. */
const RETURN_PATH = "alasin.returnTo";

export function rememberReturnPath(): void {
  // At / (the start page, or back after a failed sign-in) an address remembered earlier is kept.
  if (location.pathname === "/") return;
  const path = `${location.pathname}${location.search}`;
  try {
    if (isReturnPath(path)) sessionStorage.setItem(RETURN_PATH, path);
  } catch {
    // Storage unavailable: signing in opens the start page.
  }
}

/** The address remembered before signing in, once; null if none. */
export function takeReturnPath(): string | null {
  try {
    const path = sessionStorage.getItem(RETURN_PATH);
    sessionStorage.removeItem(RETURN_PATH);
    return path && isReturnPath(path) ? path : null;
  } catch {
    return null;
  }
}

/** Click handler for links: client-side navigation unless a modifier key asks for a new tab. */
export function linkHandler(route: Route) {
  return (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(route);
  };
}
