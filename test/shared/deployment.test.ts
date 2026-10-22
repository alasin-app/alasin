// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { buildDeployment, parseDeployment, serializeDeployment, siteBindings, siteIdProblem } from "../../src/shared/config/deployment";
import { parseConfig } from "../../src/shared/config/schema";
import { testConfig } from "../fixtures";

const base = testConfig as Record<string, unknown>;
const two = { site: { url: "https://two.example.com" }, github: { repo: "second-site" } };

describe("buildDeployment", () => {
  it("makes alasin.toml alone one site, with MEDIA and DRAFTS", () => {
    const d = buildDeployment(base, null);
    expect(d.multi).toBe(false);
    expect(d.sites.map(({ id, media, drafts }) => ({ id, media, drafts }))).toEqual([{ id: "site", media: "MEDIA", drafts: "DRAFTS" }]);
  });

  it("merges each site's file with alasin.toml, in id order, with bindings named after it", () => {
    const d = buildDeployment(base, { "my-blog": two, alpha: {} });
    expect(d.multi).toBe(true);
    expect(d.sites.map((s) => [s.id, s.media, s.drafts, s.config.github.repo, s.config.site.url])).toEqual([
      ["alpha", "MEDIA_ALPHA", "DRAFTS_ALPHA", "example-site", "https://www.example.com"],
      ["my-blog", "MEDIA_MY_BLOG", "DRAFTS_MY_BLOG", "second-site", "https://two.example.com"],
    ]);
    // What every site shares comes from alasin.toml.
    expect(d.sites[1]!.config.github.app_id).toBe(12345);
    expect(d.sites[1]!.config.ui.environment_label).toBe("TEST");
  });

  it("refuses what every site shares in a site's file", () => {
    expect(() => buildDeployment(base, { one: { ui: { name: "Mine" } } })).toThrow(/sites\/one\.toml: \[ui\] can only be set in alasin\.toml/);
    expect(() => buildDeployment(base, { one: { github: { client_id: "x" } } })).toThrow(/github\.client_id can only be set in alasin\.toml/);
  });

  it("refuses bad ids, no sites, and two sites on one repository and branch", () => {
    expect(() => buildDeployment(base, { My_Site: {} })).toThrow(/sites\/My_Site\.toml: the file name is the site's id/);
    expect(() => buildDeployment(base, { posts: {} })).toThrow(/one of the app's own paths/);
    expect(() => buildDeployment(base, {})).toThrow(/sites\/ has no/);
    expect(() => buildDeployment(base, { a: {}, b: {} })).toThrow(/same site repository and branch/);
    expect(buildDeployment(base, { a: {}, b: { github: { branch: "dev" } } }).sites).toHaveLength(2);
  });

  it("names an invalid site's file in the message", () => {
    expect(() => buildDeployment(base, { one: { media: { public_url: "not a url" } } })).toThrow(/sites\/one\.toml \(with alasin\.toml\) is not valid/);
  });
});

describe("site ids", () => {
  it("are lower-case letters, digits and hyphens", () => {
    expect(siteIdProblem("blog-2")).toBeNull();
    expect(siteIdProblem("-blog")).not.toBeNull();
    expect(siteIdProblem("api")).not.toBeNull();
    expect(siteBindings("blog-2", true)).toEqual({ media: "MEDIA_BLOG_2", drafts: "DRAFTS_BLOG_2" });
  });
});

describe("parseDeployment", () => {
  it("reads what serializeDeployment wrote", () => {
    const d = buildDeployment(base, { one: {}, two });
    expect(parseDeployment(serializeDeployment(d))).toEqual(d);
  });

  it("takes a lone configuration, from before sites, as the one site", () => {
    const d = parseDeployment(JSON.stringify(parseConfig(testConfig)));
    expect(d.multi).toBe(false);
    expect(d.sites[0]!.id).toBe("site");
    expect(d.sites[0]!.config.github.repo).toBe("example-site");
  });
});
