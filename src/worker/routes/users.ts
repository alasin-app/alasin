// SPDX-License-Identifier: MIT
//
// GET /api/users — who can log in to this deployment ([users] allow), with
// their full names from GitHub and their permission on the site repository,
// so a missing collaborator invitation shows up before someone tries to save.

import { Hono } from "hono";
import type { AppEnv } from "../app";
import { profileNames } from "../lib/profile-names";
import { getUserToken } from "../session";

export type RepoPermission = "admin" | "maintain" | "write" | "triage" | "read" | "none";

export const users = new Hono<AppEnv>();

users.get("/", async (c) => {
  const config = c.get("config");
  const token = await getUserToken(c);
  const { owner, repo } = config.github;
  const allow = config.users.allow;
  const names = await profileNames(c.env.KV, token, allow.map((u) => u.id));
  const list = await Promise.all(
    allow.map(async (u) => {
      // The user's permission on the site repository (null if GitHub won't tell).
      let permission: RepoPermission | null = null;
      try {
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/collaborators/${encodeURIComponent(u.login)}/permission`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Alasin" },
        });
        if (res.ok) permission = ((await res.json()) as { permission?: RepoPermission }).permission ?? null;
        else if (res.status === 404) permission = "none";
      } catch {
        // Shown as unknown.
      }
      return { login: u.login, id: u.id, name: names.get(u.id) ?? null, permission, you: u.id === c.get("session").uid };
    }),
  );
  return c.json({ repository: `${owner}/${repo}`, branch: config.github.branch, users: list });
});
