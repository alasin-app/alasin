// SPDX-License-Identifier: MIT
//
// Authors: `author_id` (a GitHub login) says who wrote a post; `author` is the
// name as last written. A user's current GitHub name is shown for their
// author_id; files without one are matched and shown by their author text.
// No browser dependencies, so tests can import it.

import type { SiteSettings } from "./site-types";

type User = SiteSettings["users"][number];

/** A post's or form's author fields. */
export interface Authored {
  author: string;
  /** GitHub login, "" or missing if the file has none. */
  authorId?: string;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The user who wrote it: by author_id (logins ignore case), or for a file without one by name or login. */
export function authorUser(a: Authored, site: Pick<SiteSettings, "users">): User | undefined {
  if (a.authorId) return site.users.find((u) => same(u.login, a.authorId!));
  const v = a.author.trim();
  return v ? site.users.find((u) => (u.name && same(u.name, v)) || same(u.login, v)) : undefined;
}

/** The name to show: a user's current name (login if they have none), otherwise the author text, otherwise the login. */
export function authorName(a: Authored, site: Pick<SiteSettings, "users">): string {
  const u = a.authorId ? authorUser(a, site) : undefined;
  if (u) return u.name || u.login;
  return a.author.trim() || a.authorId || "";
}

/** One key per person, for counting and filtering: their login if known, otherwise the author text. */
export function authorKey(a: Authored, site: Pick<SiteSettings, "users">): string {
  const login = authorUser(a, site)?.login ?? a.authorId;
  return login ? `@${login.toLowerCase()}` : a.author.trim();
}

/** For saving: the author text updated to the current name of the user in author_id, so the file keeps the last known name. */
export function liveAuthorName(a: Authored, site: Pick<SiteSettings, "users">): string {
  const u = a.authorId ? authorUser(a, site) : undefined;
  if (!u) return a.author;
  // Without a profile name, a name already written is kept.
  return u.name ?? (a.author.trim() || u.login);
}
