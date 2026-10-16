// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseConfig } from "../../src/shared/config/schema";
import { ALLOWED_USER, testConfig } from "../fixtures";
import { call, type FakeGitHub, fakeGitHub, login } from "./helpers";

let gh: FakeGitHub;
let cookie: string;

beforeEach(async () => {
  gh = fakeGitHub();
  ({ cookie } = await login(gh, ALLOWED_USER));
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("users", () => {
  it("lists who can log in, with full names and their permission on the site repository", async () => {
    const other = { login: "jane", id: 424242 };
    gh.profiles.set(ALLOWED_USER.id, "Octo Cat");
    gh.profiles.set(other.id, "Jane Doe");
    gh.repo.collaborators.set(ALLOWED_USER.login, "admin");
    const config = parseConfig({ ...testConfig, users: { allow: [ALLOWED_USER, other] } });
    const res = await call("/api/users", { cookie }, { ALASIN_CONFIG_JSON: JSON.stringify(config) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      repository: `${gh.repo.owner}/${gh.repo.name}`,
      branch: gh.repo.branch,
      users: [
        { login: ALLOWED_USER.login, id: ALLOWED_USER.id, name: "Octo Cat", permission: "admin", you: true },
        // Listed in alasin.toml but not invited to the repository yet.
        { login: "jane", id: 424242, name: "Jane Doe", permission: "none", you: false },
      ],
    });
  });

  it("requires a session", async () => {
    expect((await call("/api/users")).status).toBe(401);
  });
});
