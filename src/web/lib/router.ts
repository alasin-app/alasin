// SPDX-License-Identifier: MIT
// A tiny History API router: the app has a handful of top-level sections.

import { useEffect, useState } from "preact/hooks";

export type Route = "home" | "pages" | "posts" | "drafts" | "categories" | "media" | "more";

const PATHS: Record<Route, string> = {
  home: "/",
  pages: "/pages",
  posts: "/posts",
  drafts: "/drafts",
  categories: "/categories",
  media: "/media",
  more: "/more",
};

function parse(pathname: string): Route {
  const found = (Object.entries(PATHS) as [Route, string][]).find(([, p]) => p === pathname.replace(/\/+$/, "") || (p === "/" && pathname === "/"));
  return found?.[0] ?? "home";
}

const listeners = new Set<() => void>();
window.addEventListener("popstate", () => listeners.forEach((l) => l()));

export function hrefFor(route: Route): string {
  return PATHS[route];
}

export function navigate(route: Route): void {
  if (parse(location.pathname) === route) return;
  history.pushState(null, "", PATHS[route]);
  listeners.forEach((l) => l());
  window.scrollTo({ top: 0 });
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.pathname));
  useEffect(() => {
    const l = () => setRoute(parse(location.pathname));
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return route;
}

/** Click handler for links: client-side navigation unless a modifier key asks for a new tab. */
export function linkHandler(route: Route) {
  return (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(route);
  };
}
