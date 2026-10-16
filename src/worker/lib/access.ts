// SPDX-License-Identifier: MIT
//
// Who may use the deployment: everyone with write access to the site
// repository on GitHub (write, maintain or admin). Adding or removing a
// collaborator on GitHub is enough; nothing in Alasin's configuration changes.

import type { AlasinConfig } from "../../shared/config/schema";

export type RepoPermission = "admin" | "maintain" | "write" | "triage" | "read" | "none";

const WRITE: RepoPermission[] = ["admin", "maintain", "write"];
export const canWrite = (p: RepoPermission | null): boolean => p !== null && WRITE.includes(p);

const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "Alasin",
});

/** A user's permission on the site repository; "none" if they have no access, null if GitHub can't tell now. */
export async function repoPermission(token: string, config: AlasinConfig, login: string): Promise<RepoPermission | null> {
  const { owner, repo } = config.github;
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/collaborators/${encodeURIComponent(login)}/permission`, { headers: headers(token) });
    if (res.status === 404 || res.status === 403) return "none";
    if (!res.ok) return null;
    const data = (await res.json()) as { permission?: RepoPermission; role_name?: string };
    // role_name tells maintain and triage apart from write and read.
    const role = data.role_name as RepoPermission | undefined;
    return role && ["admin", "maintain", "write", "triage", "read"].includes(role) ? role : (data.permission ?? null);
  } catch {
    return null;
  }
}

export interface Member {
  login: string;
  id: number;
}

const CACHE_SECONDS = 600;

/**
 * Who can log in: the repository's collaborators with write access (asked
 * with the signed-in user's token, kept in KV for 10 minutes).
 */
export async function members(kv: KVNamespace, token: string, config: AlasinConfig): Promise<Member[]> {
  const { owner, repo } = config.github;
  const key = `collaborators:${owner}/${repo}`;
  const kept = await kv.get(key);
  if (kept) return JSON.parse(kept) as Member[];
  const list: Member[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/collaborators?permission=push&per_page=100&page=${page}`, { headers: headers(token) });
    if (!res.ok) break;
    const batch = (await res.json()) as { login: string; id: number; type?: string }[];
    list.push(...batch.filter((u) => u.type !== "Bot").map((u) => ({ login: u.login, id: u.id })));
    if (batch.length < 100) break;
  }
  await kv.put(key, JSON.stringify(list), { expirationTtl: CACHE_SECONDS });
  return list;
}
