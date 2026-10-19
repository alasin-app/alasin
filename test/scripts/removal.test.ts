// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { planItems, siteItems, type SiteState } from "../../scripts/lib/create-site";
import { devKeys, removalLines, removalSteps } from "../../scripts/lib/removal";
import { removeTables } from "../../scripts/lib/toml-edit";

const base: SiteState = {
  version: 1,
  owner: "octocat",
  repo: "example.com",
  alasinName: "alasin-example",
  environments: ["production", "dev"],
  jurisdiction: "eu",
  domains: { site: "www.example.com", app: "alasin.example.com", media: "media.example.com" },
  created: [
    "bucket:example-com-media",
    "bucket:example-com-drafts",
    "bucket:example-com-dev-media",
    "bucket:example-com-dev-drafts",
    "repo",
    "worker:example-com",
    "config",
    "worker:alasin-example",
    "pending:worker:alasin-example-dev",
    "sample:content",
    "sample:photos",
  ],
};
const items = siteItems(base);
const view = (mode: "all" | "dev", state = base) => removalSteps(state, siteItems(state), mode).map((s) => `${s.remove ? "-" : "="} ${s.key}`);

describe("removing a site", () => {
  it("removes everything create-site made, in order, the local folder last", () => {
    expect(view("all")).toEqual([
      "- worker:alasin-example",
      "- worker:alasin-example-dev",
      "- github-app:production",
      "- github-app:dev",
      "- worker:example-com",
      "- bucket:example-com-media",
      "- bucket:example-com-drafts",
      "- bucket:example-com-dev-media",
      "- bucket:example-com-dev-drafts",
      "- repo",
      "- local",
    ]);
  });

  it("removes only the dev environment with --remove-dev", () => {
    expect(view("dev")).toEqual([
      "- worker:alasin-example-dev",
      "- github-app:dev",
      "- bucket:example-com-dev-media",
      "- bucket:example-com-dev-drafts",
      "- dev-branch",
      "- local:dev",
    ]);
    expect(devKeys(base, items).sort()).toEqual(["bucket:example-com-dev-drafts", "bucket:example-com-dev-media", "pending:worker:alasin-example-dev", "sample:content", "sample:photos"]);
  });

  it("keeps what create-site didn't make: an existing site's items are never removed", () => {
    const existing = { ...base, created: ["bucket:example-com-dev-media", "bucket:example-com-dev-drafts"] };
    const steps = removalSteps(existing, siteItems(existing), "all");
    expect(steps.filter((s) => s.remove).map((s) => s.key)).toEqual(["bucket:example-com-dev-media", "bucket:example-com-dev-drafts", "local"]);
    expect(removalLines(steps).find((l) => l.startsWith("octocat/example.com "))).toContain("kept: not made by create-site");
    // No configuration of its own: no GitHub Apps to remove.
    expect(steps.some((s) => s.kind === "github-app")).toBe(false);
  });
});

describe("a removal that stopped", () => {
  it("shows what it already removed as removed, not as kept", () => {
    // The Worker was removed (and forgotten) in the first run; the repository is still to go.
    const state = { ...base, environments: ["production" as const], created: ["repo", "config"] };
    const all = siteItems(state);
    const plan = planItems(all, new Map(all.map((i) => [i.key, i.key === "repo"])), state.created);
    const lines = removalLines(removalSteps(state, plan, "all"));
    expect(lines.find((l) => l.startsWith("alasin-example "))).toContain("already removed");
    expect(lines.find((l) => l.startsWith("octocat/example.com "))).toContain("deleted on GitHub");
  });
});

describe("removeTables", () => {
  it("removes a table and its sub-tables, with their marker line, and nothing else", () => {
    const text = [
      'name = "alasin"',
      "",
      "[[r2_buckets]]",
      'binding = "MEDIA"',
      "",
      "# --- [env.dev] - added by npm run create-site ---",
      "[env.dev]",
      'name = "alasin-dev"',
      "routes = []",
      "",
      "[[env.dev.r2_buckets]]",
      'binding = "MEDIA"',
      "",
      "[env.devx]",
      "kept = true",
      "",
    ].join("\n");
    expect(removeTables(text, "env.dev")).toBe(['name = "alasin"', "", "[[r2_buckets]]", 'binding = "MEDIA"', "", "[env.devx]", "kept = true", ""].join("\n"));
  });
});
