// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { swallowedOptions, swallowedOptionsMessage } from "../../scripts/lib/npm-args";

describe("options swallowed by npm", () => {
  it("detects --env and --config given without --", () => {
    // What `npm run deploy --env dev --config x.toml` leaves behind.
    expect(swallowedOptions({ npm_config_env: "true", npm_config_config: "true" })).toEqual(["--env", "--config"]);
    expect(swallowedOptions({ npm_config_wrangler_config: "true" })).toEqual(["--wrangler-config"]);
  });

  it("is quiet when options were passed after --", () => {
    expect(swallowedOptions({ npm_config_cache: "/tmp", npm_lifecycle_event: "deploy" })).toEqual([]);
  });

  it("says how to fix it", () => {
    expect(swallowedOptionsMessage("deploy", ["--env"])).toContain("npm run deploy -- --env dev");
  });
});
