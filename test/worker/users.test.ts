// SPDX-License-Identifier: MIT
import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALLOWED_USER } from "../fixtures";
import { call, type FakeGitHub, fakeGitHub, login } from "./helpers";

let gh: FakeGitHub;
let cookie: string;

beforeEach(async () => {
  gh = fakeGitHub();
  ({ cookie } = await login(gh, ALLOWED_USER));
  // The repository's writers are kept in KV for a while; each test starts fresh.
  await env.KV.delete(`collaborators:${gh.repo.owner}/${gh.repo.name}`);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("users", () => {
  it("lists the repository's writers, with full names and their permission", async () => {
    const other = { login: "jane", id: 424242 };
    gh.profiles.set(ALLOWED_USER.id, "Octo Cat");
    gh.profiles.set(other.id, "Jane Doe");
    gh.repo.collaborators.set(ALLOWED_USER.login, { permission: "admin", id: ALLOWED_USER.id });
    gh.repo.collaborators.set(other.login, { permission: "maintain", id: other.id });
    gh.repo.collaborators.set("reader", { permission: "read", id: 777 });
    const res = await call("/api/users", { cookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      repository: `${gh.repo.owner}/${gh.repo.name}`,
      branch: gh.repo.branch,
      users: [
        { login: ALLOWED_USER.login, id: ALLOWED_USER.id, name: "Octo Cat", permission: "admin", you: true },
        { login: "jane", id: 424242, name: "Jane Doe", permission: "maintain", you: false },
      ],
    });
  });

  it("requires a session", async () => {
    expect((await call("/api/users")).status).toBe(401);
  });
});
