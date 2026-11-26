// SPDX-License-Identifier: MIT
// What the build adds to the Worker's Wrangler configuration (#432): the
// deployment is compiled into the script, not passed as a variable, so any
// number of sites fits.
import { describe, expect, it } from "vitest";
import { managedSettings } from "../../scripts/lib/managed";
import { buildDeployment, parseDeployment, serializeDeployment } from "../../src/shared/config/deployment";
import { testConfig } from "../fixtures";

/** Cloudflare's limit for a text binding, which ALASIN_CONFIG_JSON used to be. */
const TEXT_BINDING_LIMIT = 5.1 * 1000;

const sites = Object.fromEntries(
  Array.from({ length: 10 }, (_, i) => [
    `site-${i}`,
    { site: { url: `https://site-${i}.example.com` }, github: { repo: `site-${i}` }, media: { public_url: `https://media-${i}.example.com/` } },
  ]),
);
const deployment = buildDeployment(testConfig as Record<string, unknown>, sites);

describe("managedSettings", () => {
  const managed = managedSettings(deployment, "1.2.3");

  it("compiles the deployment into the script, however large", () => {
    const raw = JSON.parse(managed.define.__ALASIN_CONFIG_JSON__) as string;
    expect(raw).toBe(serializeDeployment(deployment));
    expect(raw.length).toBeGreaterThan(TEXT_BINDING_LIMIT);
    expect(parseDeployment(raw).sites.map((s) => s.id)).toEqual(Object.keys(sites).sort());
  });

  it("passes nothing as a variable", () => {
    expect(managed).not.toHaveProperty("vars");
  });

  it("compiles in the version", () => {
    expect(JSON.parse(managed.define.__ALASIN_VERSION__)).toBe("1.2.3");
  });

  it("schedules each distinct cleanup time once", () => {
    expect(managed.triggers.crons).toEqual([...new Set(deployment.sites.map((s) => s.config.drafts.cleanup_cron))]);
    expect(managed.triggers.crons).toHaveLength(1);
  });
});
