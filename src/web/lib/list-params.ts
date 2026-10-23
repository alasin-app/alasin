// SPDX-License-Identifier: MIT
// What a list of posts or pages shows, kept in its address (#399), so a list
// can be bookmarked, shared with another writer and survives a reload:
//
//   /posts?state=draft&category=travel&category=food&author=octocat&tag=winter&sort=oldest&q=bergen
//
// Every part is optional; a list with nothing chosen has no query at all.

export type ListState = "all" | "draft" | "archived";
export type ListSort = "newest" | "oldest";

export interface ListParams {
  state: ListState;
  categories: string[];
  authors: string[];
  tags: string[];
  sort: ListSort;
  query: string;
}

const values = (params: URLSearchParams, name: string) => [...new Set(params.getAll(name).filter((v) => v !== ""))];

export function parseListParams(search: string): ListParams {
  const params = new URLSearchParams(search);
  const state = params.get("state");
  return {
    state: state === "draft" || state === "archived" ? state : "all",
    categories: values(params, "category"),
    authors: values(params, "author"),
    tags: values(params, "tag"),
    sort: params.get("sort") === "oldest" ? "oldest" : "newest",
    query: params.get("q") ?? "",
  };
}

/** The query for a list, with its leading "?", or "" when nothing is chosen. */
export function listSearch(list: ListParams): string {
  const params = new URLSearchParams();
  if (list.state !== "all") params.set("state", list.state);
  for (const v of list.categories) params.append("category", v);
  for (const v of list.authors) params.append("author", v);
  for (const v of list.tags) params.append("tag", v);
  if (list.sort !== "newest") params.set("sort", list.sort);
  if (list.query !== "") params.set("q", list.query);
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** An address of the app to return to after signing in: a path of this origin, not the sign-in or API routes. */
export function isReturnPath(path: string): boolean {
  return /^\/(?![/\\])/.test(path) && !/^\/(?:auth|api)(?:[/?#]|$)/.test(path) && !/[\s\0]/.test(path);
}
