// SPDX-License-Identifier: MIT
/// <reference types="vite/client" />
import { parse } from "smol-toml";
import { describe, expect, it } from "vitest";
import { parseConfig, selectEnvironment } from "../../src/shared/config/schema";
import { siteItems, type SiteState } from "../../scripts/lib/create-site";
import { siteConfigFor } from "../../scripts/lib/site-config";

const read = (glob: Record<string, string>) => Object.values(glob)[0]!;
const alasinExample = read(import.meta.glob("../../alasin.example.toml", { query: "?raw", import: "default", eager: true }) as Record<string, string>);
const wranglerExample = read(import.meta.glob("../../wrangler.example.toml", { query: "?raw", import: "default", eager: true }) as Record<string, string>);

const state: SiteState = {
  version: 1,
  owner: "octocat",
  repo: "example.com",
  alasinName: "alasin-example",
  environments: ["production", "dev"],
  jurisdiction: "eu",
  domains: { site: "www.example.com", app: "alasin.example.com", media: "media.example.com" },
  created: [],
  devMediaUrl: "https://pub-0123.r2.dev/",
  devSiteUrl: "https://dev-example-com.octocat.workers.dev/",
};
const devAppUrl = "https://alasin-example-dev.octocat.workers.dev";

type Table = Record<string, unknown>;
const buckets = (t: Table) => Object.fromEntries((t.r2_buckets as Table[]).map((b) => [b.binding, [b.bucket_name, b.jurisdiction]]));

describe("a new site's Alasin configuration", () => {
  it("has production and dev, each with its own address, branch, buckets and Worker", () => {
    const { alasin, wrangler } = siteConfigFor(state, siteItems(state), { alasinExample, wranglerExample, devAppUrl });
    const raw = parse(alasin) as Table;
    const prod = parseConfig(selectEnvironment(raw, undefined));
    const dev = parseConfig(selectEnvironment(raw, "dev"));
    expect([prod.app.url, prod.github.repo, prod.github.branch, prod.site.url, prod.media.public_url]).toEqual([
      "https://alasin.example.com",
      "example.com",
      "main",
      "https://www.example.com",
      "https://media.example.com/",
    ]);
    expect([dev.app.url, dev.github.branch, dev.site.url, dev.media.public_url, dev.ui.environment_label]).toEqual([
      "https://alasin-example-dev.octocat.workers.dev",
      "dev",
      "https://dev-example-com.octocat.workers.dev",
      "https://pub-0123.r2.dev/",
      "DEV",
    ]);
    // Dev's own GitHub App is still to be made by setup: the example's placeholders, not production's.
    const devGithub = ((raw.env as Table).dev as Table).github as Table;
    expect([devGithub.app_id, devGithub.client_id, devGithub.installation_id]).toEqual([123456, "Iv23liAbCdEfGhIjKlMn", 12345678]);

    const w = parse(wrangler) as Table;
    expect(w.name).toBe("alasin-example");
    expect(buckets(w)).toEqual({ MEDIA: ["example-com-media", "eu"], DRAFTS: ["example-com-drafts", "eu"] });
    const wd = (w.env as Table).dev as Table;
    expect(wd.name).toBe("alasin-example-dev");
    expect(wd.workers_dev).toBe(true);
    // Its own routes, so deploying dev never takes production's custom domain.
    expect(wd.routes).toEqual([]);
    expect(buckets(wd)).toEqual({ MEDIA: ["example-com-dev-media", "eu"], DRAFTS: ["example-com-dev-drafts", "eu"] });
  });

  it("is the dev deployment alone when there's only dev", () => {
    const only = { ...state, environments: ["dev" as const], domains: {} };
    const { alasin, wrangler } = siteConfigFor(only, siteItems(only), { alasinExample, wranglerExample, devAppUrl });
    const c = parseConfig(selectEnvironment(parse(alasin) as Table, undefined));
    expect([c.app.url, c.github.branch, c.ui.environment_label]).toEqual([devAppUrl, "dev", "DEV"]);
    const w = parse(wrangler) as Table;
    expect(w.name).toBe("alasin-example-dev");
    expect(w.env).toBeUndefined();
    expect(buckets(w)).toEqual({ MEDIA: ["example-com-dev-media", "eu"], DRAFTS: ["example-com-dev-drafts", "eu"] });
  });

  it("needs the dev addresses first", () => {
    expect(() => siteConfigFor({ ...state, devSiteUrl: undefined }, siteItems(state), { alasinExample, wranglerExample, devAppUrl })).toThrow("must be known first");
  });
});
