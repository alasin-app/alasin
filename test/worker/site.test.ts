// SPDX-License-Identifier: MIT
import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseConfig } from "../../src/shared/config/schema";
import { ALLOWED_USER, testConfig } from "../fixtures";
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

type Site = {
  categories: { slug: string; title: string; parent?: string }[];
  images: { widths: number[]; quality: number; maxSize: number };
  author: string | null;
  authorField: string | null;
  gallery: { shortcode: string; paired: boolean };
};

describe("site settings", () => {
  it("lists categories with their titles from term pages", async () => {
    await gh.repo.write("content/categories/travel/_index.md", '---\ntitle: "Travel"\nslug: "travel"\n---\n');
    await gh.repo.write("content/categories/radio/_index.md", '---\ntitle: "Amateur radio"\n---\n');
    await gh.repo.write("content/categories/untitled/_index.md", "---\nslug: untitled\n---\n");
    await gh.repo.write("content/categories/qrp/_index.md", '---\ntitle: "QRP"\nparent: "radio"\n---\n');
    const site = (await (await call("/api/site", { cookie })).json()) as Site;
    expect(site.categories).toEqual([
      { slug: "radio", title: "Amateur radio" },
      { slug: "qrp", title: "QRP", parent: "radio" },
      { slug: "travel", title: "Travel" },
      { slug: "untitled", title: "untitled" },
    ]);
    expect(site.gallery).toEqual({ shortcode: "gallery", paired: true });
  });

  it("reads image sizes from the site's config file when configured", async () => {
    await gh.repo.write("config/_default/params.toml", "imageWidths = [400, 800]\nimageQuality = 75\n");
    const config = parseConfig({ ...testConfig, images: { site_config_file: "config/_default/params.toml" } });
    const res = await call("/api/site", { cookie }, { ALASIN_CONFIG_JSON: JSON.stringify(config) });
    const site = (await res.json()) as Site;
    expect(site.images).toMatchObject({ widths: [400, 800], quality: 75, maxSize: 2560 });
  });

  it("falls back to alasin.toml's image sizes", async () => {
    const site = (await (await call("/api/site", { cookie })).json()) as Site;
    expect(site.images).toMatchObject({ widths: [480, 960, 1600], quality: 80 });
    expect(site.categories).toEqual([]);
  });

  it("takes full names from GitHub profiles of the repository's writers", async () => {
    const other = { login: "jane", id: 424242 };
    gh.profiles.set(ALLOWED_USER.id, "Octo Cat");
    gh.profiles.set(other.id, "Jane Doe");
    gh.repo.collaborators.set(other.login, { permission: "write", id: other.id });
    const config = parseConfig({ ...testConfig, site: { ...testConfig.site, author_field: "author" } });
    const get = async () =>
      (await (await call("/api/site", { cookie }, { ALASIN_CONFIG_JSON: JSON.stringify(config) })).json()) as Site & {
        users: { login: string; id: number; name: string | null }[];
        authorIdField: string | null;
        login: string;
      };
    const site = await get();
    expect(site).toMatchObject({ author: "Octo Cat", authorField: "author", authorIdField: "author_id", login: ALLOWED_USER.login });
    expect(site.users).toEqual([
      { login: ALLOWED_USER.login, id: ALLOWED_USER.id, name: "Octo Cat" },
      { login: "jane", id: 424242, name: "Jane Doe" },
    ]);
    // Never kept: a name changed on GitHub shows at once.
    gh.profiles.set(other.id, "Changed");
    expect((await get()).users[1]!.name).toBe("Changed");
  });

  it("has no author_id field without an author field", async () => {
    const site = (await (await call("/api/site", { cookie })).json()) as { authorField: string | null; authorIdField: string | null };
    expect(site).toMatchObject({ authorField: null, authorIdField: null });
  });

  it("requires a session", async () => {
    expect((await call("/api/site")).status).toBe(401);
  });
});
