// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { checkBindings } from "../../scripts/lib/bindings";
import { buildDeployment } from "../../src/shared/config/deployment";
import { testConfig } from "../fixtures";

const base = testConfig as Record<string, unknown>;
const two = { site: { url: "https://two.example.com" }, github: { repo: "second-site" } };

describe("checkBindings", () => {
  const complete = (r2: { binding: string; bucket_name: string }[]) => ({
    r2_buckets: r2,
    kv_namespaces: [{ binding: "KV", id: "abc123" }],
    durable_objects: { bindings: [{ name: "LOCKS", class_name: "EditLocks" }] },
    ratelimits: [{ name: "RL_AUTH" }, { name: "RL_UPLOAD" }, { name: "RL_COMMIT" }],
  });

  it("needs every site's buckets, each its own", () => {
    const sites = buildDeployment(base, { one: {}, two }).sites;
    expect(
      checkBindings(
        complete([
          { binding: "MEDIA_ONE", bucket_name: "one-media" },
          { binding: "DRAFTS_ONE", bucket_name: "one-drafts" },
          { binding: "MEDIA_TWO", bucket_name: "two-media" },
          { binding: "DRAFTS_TWO", bucket_name: "two-drafts" },
        ]),
        "wrangler.toml",
        sites,
      ),
    ).toEqual([]);
    expect(
      checkBindings(
        complete([
          { binding: "MEDIA_ONE", bucket_name: "one-media" },
          { binding: "DRAFTS_ONE", bucket_name: "shared-drafts" },
          { binding: "MEDIA_TWO", bucket_name: "two-media" },
          { binding: "DRAFTS_TWO", bucket_name: "shared-drafts" },
        ]),
        "wrangler.toml",
        sites,
      ),
    ).toEqual(["wrangler.toml: DRAFTS_ONE and DRAFTS_TWO must be different buckets, but both are shared-drafts"]);
    expect(checkBindings(complete([{ binding: "MEDIA_ONE", bucket_name: "one-media" }]), "wrangler.toml", sites)).toContain(
      'wrangler.toml: missing [[r2_buckets]] with binding = "DRAFTS_TWO"',
    );
  });
});
