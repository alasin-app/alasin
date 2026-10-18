// SPDX-License-Identifier: MIT
//
// GET /api/users — who can log in to this deployment: the site repository's
// collaborators with write access, with their full names from GitHub and
// their permission on the repository. Always read from GitHub, not the kept
// list, so someone who has just accepted an invitation shows at once (the page
// is opened rarely).

import { Hono } from "hono";
import type { AppEnv } from "../app";
import { members, repoPermission } from "../lib/access";
import { profileNames } from "../lib/profile-names";
import { getUserToken } from "../session";

export const users = new Hono<AppEnv>();

users.get("/", async (c) => {
  const config = c.get("config");
  const token = await getUserToken(c);
  const { owner, repo } = config.github;
  const people = await members(c.env.KV, token, config, { fresh: true });
  const names = await profileNames(token, people.map((u) => u.id));
  const list = await Promise.all(
    people.map(async (u) => ({
      login: u.login,
      id: u.id,
      name: names.get(u.id) ?? null,
      permission: await repoPermission(token, config, u.login),
      you: u.id === c.get("session").uid,
    })),
  );
  return c.json({ repository: `${owner}/${repo}`, branch: config.github.branch, users: list });
});
