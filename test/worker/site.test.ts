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

  it("gives the signed-in user's author name", async () => {
    const config = parseConfig({
      ...testConfig,
      site: { ...testConfig.site, author_field: "author" },
      users: { allow: [{ ...ALLOWED_USER, author: "Octo" }] },
    });
    const site = (await (await call("/api/site", { cookie }, { ALASIN_CONFIG_JSON: JSON.stringify(config) })).json()) as Site;
    expect(site).toMatchObject({ author: "Octo", authorField: "author" });
  });

  it("writes the login as author by default, and tells who author values mean", async () => {
    const config = parseConfig({
      ...testConfig,
      site: { ...testConfig.site, author_field: "author" },
      users: { allow: [{ ...ALLOWED_USER, aliases: ["Mona", "M. Octo"] }] },
    });
    const site = (await (await call("/api/site", { cookie }, { ALASIN_CONFIG_JSON: JSON.stringify(config) })).json()) as Site & {
      users: { login: string; id: number; names: string[] }[];
    };
    expect(site.author).toBe(ALLOWED_USER.login);
    expect(site.users).toEqual([{ login: ALLOWED_USER.login, id: ALLOWED_USER.id, names: [ALLOWED_USER.login, ALLOWED_USER.login, "Mona", "M. Octo"] }]);
  });

  it("requires a session", async () => {
    expect((await call("/api/site")).status).toBe(401);
  });
});
