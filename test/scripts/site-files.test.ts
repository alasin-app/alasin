// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { parse } from "smol-toml";
import example from "../../alasin.example.toml?raw";
import { renameBucketBindings, siteTemplate, splitSiteConfig } from "../../scripts/lib/site-files";

describe("splitSiteConfig", () => {
  const split = splitSiteConfig(example)!;
  const app = parse(split.app) as Record<string, Record<string, unknown>>;
  const site = parse(split.site) as Record<string, Record<string, unknown>>;

  it("keeps what every site shares in alasin.toml", () => {
    expect(Object.keys(app).sort()).toEqual(["app", "github", "security", "ui"]);
    expect(Object.keys(app.github!).sort()).toEqual(["app_id", "client_id"]);
  });

  it("moves the site's own sections, and its repository, to the site's file", () => {
    expect(Object.keys(site)).toEqual(expect.arrayContaining(["site", "github", "media", "drafts", "images", "editor", "categories"]));
    expect(Object.keys(site)).not.toContain("app");
    expect(Object.keys(site.github!).sort()).toEqual(["branch", "owner", "repo"]);
  });

  it("keeps the comments with the values", () => {
    expect(split.site).toContain("# Owner (user or organisation) of the site repository.");
    expect(split.site).toContain("# installation_id = 12345678");
    expect(split.site).not.toContain("# Client ID of the GitHub App.");
    expect(split.app).toContain("# Client ID of the GitHub App.");
    expect(split.app).not.toContain("# Owner (user or organisation)");
    // The [env.<name>] tables stay where they were.
    expect(split.app).toContain("# [env.dev.app]");
  });

  it("is null without section banners", () => {
    expect(splitSiteConfig('[site]\nurl = "https://www.example.com"\n')).toBeNull();
  });

  it("gives the site template", () => {
    expect(siteTemplate(example)).toMatch(/^# sites\/<id>\.toml/);
  });
});

describe("renameBucketBindings", () => {
  it("names MEDIA and DRAFTS for the site, also in [env.<name>]", () => {
    const text = '[[r2_buckets]]\nbinding = "MEDIA"\nbucket_name = "m"\n\n[[r2_buckets]]\nbinding = "DRAFTS"\n\n[[env.dev.r2_buckets]]\nbinding = "DRAFTS"\n';
    expect(renameBucketBindings(text, "MEDIA_BLOG", "DRAFTS_BLOG")).toBe(
      '[[r2_buckets]]\nbinding = "MEDIA_BLOG"\nbucket_name = "m"\n\n[[r2_buckets]]\nbinding = "DRAFTS_BLOG"\n\n[[env.dev.r2_buckets]]\nbinding = "DRAFTS_BLOG"\n',
    );
  });
});
