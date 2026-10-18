// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  alreadyDeployedWarning,
  BUILD_TRIGGERS,
  cloudflareName,
  type Existing,
  hostnameProblem,
  namesFromAlasinWrangler,
  parseRepository,
  planItems,
  planLines,
  previewUrl,
  r2DevUrl,
  siteItems,
  siteWorkerName,
  skeletonValuesFor,
  stripJsonc,
  zoneCandidates,
} from "../../scripts/lib/create-site";

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

  it("counts a domain it added as its own before DNS finds it, but plans a vanished bucket again", () => {
    const items = siteItems(answers);
    const existing: Existing = new Map(items.map((i) => [i.key, false]));
    const plan = planItems(items, existing, ["domain:media.example.com", "bucket:my-site-media"]);
    expect(plan.find((p) => p.key === "domain:media.example.com")!.status).toBe("ours");
    expect(plan.find((p) => p.key === "bucket:my-site-media")!.status).toBe("new");
    expect(plan.find((p) => p.key === "domain:www.example.com")!.status).toBe("new");
  });

  it("has no warning for a re-run of its own deployment", () => {
    const items = siteItems(answers);
    const all = new Map(items.map((i) => [i.key, true]));
    expect(alreadyDeployedWarning(planItems(items, all, items.map((i) => i.key)))).toBeNull();
  });
});

describe("a site deployed earlier", () => {
  const wrangler = {
    name: "alasin",
    r2_buckets: [
      { binding: "MEDIA", bucket_name: "old-media", jurisdiction: "eu" },
      { binding: "DRAFTS", bucket_name: "old-media-drafts", jurisdiction: "eu" },
    ],
    env: { dev: { name: "alasin-test", r2_buckets: [{ binding: "DRAFTS", bucket_name: "old-drafts-dev" }] } },
  };

  it("takes the Alasin Workers and buckets from the deployment's wrangler.toml", () => {
    const known = namesFromAlasinWrangler(wrangler, "deployments/my-site/wrangler.toml");
    expect(known).toEqual({
      "alasin:production": { name: "alasin", source: "deployments/my-site/wrangler.toml" },
      "media:production": { name: "old-media", source: "deployments/my-site/wrangler.toml", jurisdiction: "eu" },
      "drafts:production": { name: "old-media-drafts", source: "deployments/my-site/wrangler.toml", jurisdiction: "eu" },
      "alasin:dev": { name: "alasin-test", source: "deployments/my-site/wrangler.toml" },
      "drafts:dev": { name: "old-drafts-dev", source: "deployments/my-site/wrangler.toml", jurisdiction: "" },
    });
    expect(namesFromAlasinWrangler({}, "x")).toEqual({});
  });

  it("reads the site Worker's name from JSONC, JSON or TOML", () => {
    const jsonc = `// The site, as static assets.\n{\n  "name": "example-com", // built by Workers Builds\n  /* see https://example.com/docs */\n  "routes": [{ "pattern": "https://www.example.com/*" },],\n}\n`;
    expect(siteWorkerName("wrangler.jsonc", jsonc)).toBe("example-com");
    expect(siteWorkerName("wrangler.json", '{"name":"a"}')).toBe("a");
    expect(siteWorkerName("wrangler.toml", 'name = "b"\n')).toBe("b");
    expect(siteWorkerName("wrangler.jsonc", "{ not json")).toBeNull();
    expect(stripJsonc('{"url": "https://x//y", "a": 1,}')).toBe('{"url": "https://x//y", "a": 1}');
  });

  it("plans existing names instead of a second set, and says where they came from", () => {
    const known = { ...namesFromAlasinWrangler(wrangler, "deployments/my-site/wrangler.toml"), "site-worker": { name: "example-com", source: "octocat/My.Site/wrangler.jsonc" } };
    const items = siteItems(answers, known);
    expect(items.map((i) => i.name)).toEqual([
      "octocat/My.Site",
      "old-media",
      "old-media-drafts",
      "my-site-dev-media",
      "old-drafts-dev",
      "example-com",
      "alasin",
      "alasin-test",
      "www.example.com",
      "alasin.example.com",
      "media.example.com",
    ]);
    expect(items.find((i) => i.name === "old-media")).toMatchObject({ deployed: "deployments/my-site/wrangler.toml", jurisdiction: "eu" });

    const plan = planItems(items, new Map(items.map((i) => [i.key, i.name !== "my-site-dev-media"])), []);
    expect(planLines(plan)[1]).toContain("[as in deployments/my-site/wrangler.toml]: EXISTS");
    expect(alreadyDeployedWarning(plan)).toContain(
      "This site is already deployed: its own names are taken from deployments/my-site/wrangler.toml and octocat/My.Site/wrangler.jsonc, so no second set is planned.",
    );
  });
});

describe("creating a site", () => {
  it("deploys only main to production; every other branch, dev included, is a preview", () => {
    const [prod, preview] = BUILD_TRIGGERS;
    expect(prod).toMatchObject({ branch_includes: ["main"], deploy_command: "npx wrangler deploy", branch: "main" });
    expect(preview).toMatchObject({ branch_includes: ["*"], branch_excludes: ["main"], deploy_command: "npx wrangler versions upload", branch: "dev" });
  });

  it("looks for a host's zone from the most specific name", () => {
    expect(zoneCandidates("img.blog.example.com")).toEqual(["img.blog.example.com", "blog.example.com", "example.com"]);
    expect(zoneCandidates("example.com")).toEqual(["example.com"]);
  });

  it("gives the dev branch's preview address of the site Worker", () => {
    expect(previewUrl("example-com", "dev", "octocat")).toBe("https://dev-example-com.octocat.workers.dev/");
    expect(previewUrl("example-com", "Feature/New_Thing", "octocat")).toBe("https://feature-new-thing-example-com.octocat.workers.dev/");
  });

  it("reads the r2.dev URL from Wrangler's output", () => {
    expect(r2DevUrl("Public access is enabled at 'https://pub-0123abc.r2.dev'.")).toBe("https://pub-0123abc.r2.dev/");
    expect(r2DevUrl("Public access via the r2.dev URL is disabled.")).toBeNull();
  });

  it("fills the skeleton from the answers and the plan", () => {
    const state = { version: 1 as const, ...answers, jurisdiction: "eu", created: [], title: "My site", devMediaUrl: "https://pub-0123.r2.dev/" };
    expect(skeletonValuesFor(state, siteItems(state))).toEqual({
      SITE_URL: "https://www.example.com",
      SITE_TITLE: "My site",
      LANGUAGE: "en",
      MEDIA_URL: "https://media.example.com/",
      DEV_MEDIA_URL: "https://pub-0123.r2.dev/",
      SITE_WORKER: "my-site",
      MODULE_PATH: "github.com/octocat/My.Site",
    });
    // Dev only: root-relative links, the dev bucket for both.
    const dev = { ...state, environments: ["dev" as const], domains: {}, title: undefined };
    expect(skeletonValuesFor(dev, siteItems(dev))).toMatchObject({ SITE_URL: "", SITE_TITLE: "My.Site", MEDIA_URL: "https://pub-0123.r2.dev/", DEV_MEDIA_URL: "https://pub-0123.r2.dev/" });
    expect(() => skeletonValuesFor({ ...dev, devMediaUrl: undefined }, siteItems(dev))).toThrow("No media URL yet");
  });
});
