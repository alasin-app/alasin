// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { alreadyDeployedWarning, cloudflareName, type Existing, hostnameProblem, parseRepository, planItems, planLines, siteItems } from "../../scripts/lib/create-site";

const answers = {
  owner: "octocat",
  repo: "My.Site",
  alasinName: "Alasin",
  environments: ["production", "dev"] as ("production" | "dev")[],
  domains: { site: "www.example.com", app: "alasin.example.com", media: "media.example.com" },
};

describe("create-site answers", () => {
  it("reads owner/name and refuses anything else", () => {
    expect(parseRepository(" octocat/my-site ")).toEqual({ owner: "octocat", repo: "my-site" });
    expect(parseRepository("my-site")).toBe("write it as owner/name");
    expect(parseRepository("-bad/x")).toContain("isn't a GitHub account");
    expect(parseRepository("octocat/..")).toContain("isn't a GitHub repository name");
    expect(parseRepository("a/b/c")).toBe("write it as owner/name");
  });

  it("checks hostnames", () => {
    expect(hostnameProblem("www.example.com")).toBeNull();
    for (const bad of ["example", "https://example.com", "www.example.com/", "-a.example.com"]) expect(hostnameProblem(bad)).not.toBeNull();
  });

  it("makes Cloudflare-safe names that leave room for every suffix", () => {
    expect(cloudflareName("My.Site")).toBe("my-site");
    expect(cloudflareName("__a..b__")).toBe("a-b");
    const long = cloudflareName("x".repeat(100));
    expect(`${long}-dev-drafts`.length).toBeLessThanOrEqual(63);
  });
});

describe("create-site plan", () => {
  it("names every item from the repository and the Alasin name", () => {
    expect(siteItems(answers).map((i) => i.key)).toEqual([
      "repo",
      "bucket:my-site-media",
      "bucket:my-site-drafts",
      "bucket:my-site-dev-media",
      "bucket:my-site-dev-drafts",
      "worker:my-site",
      "worker:alasin",
      "worker:alasin-dev",
      "domain:www.example.com",
      "domain:alasin.example.com",
      "domain:media.example.com",
    ]);
    expect(siteItems({ ...answers, environments: ["dev"] }).map((i) => i.key)).toEqual([
      "repo",
      "bucket:my-site-dev-media",
      "bucket:my-site-dev-drafts",
      "worker:my-site",
      "worker:alasin-dev",
    ]);
  });

  it("tells new items from this deployment's own and from ones it didn't make", () => {
    const items = siteItems({ ...answers, environments: ["dev"] });
    const existing: Existing = new Map([
      ["repo", true],
      ["bucket:my-site-dev-media", true],
      ["bucket:my-site-dev-drafts", false],
      ["worker:my-site", null],
    ]);
    const plan = planItems(items, existing, ["bucket:my-site-dev-media"]);
    expect(plan.map((p) => p.status)).toEqual(["not-ours", "ours", "new", "unknown", "unknown"]);
    expect(planLines(plan)[0]).toContain("EXISTS, not made by this deployment");

    const warning = alreadyDeployedWarning(plan)!;
    expect(warning).toContain("octocat/My.Site (site repository) on GitHub");
    expect(warning).toContain("may be a live site");
    expect(warning).not.toContain("my-site-dev-media");
  });

  it("has no warning for a re-run of its own deployment", () => {
    const items = siteItems(answers);
    const all = new Map(items.map((i) => [i.key, true]));
    expect(alreadyDeployedWarning(planItems(items, all, items.map((i) => i.key)))).toBeNull();
  });
});
