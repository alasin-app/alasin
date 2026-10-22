// SPDX-License-Identifier: MIT
// The bindings the Worker needs in wrangler.toml (no Node APIs, so tests can use it anywhere).

import { SINGLE_SITE_ID, siteBindings } from "../../src/shared/config/deployment";

type Table = Record<string, unknown>;

const RATE_LIMITS = ["RL_AUTH", "RL_UPLOAD", "RL_COMMIT"];

function asArray(v: unknown): Table[] {
  return Array.isArray(v) ? (v as Table[]) : [];
}

/**
 * Checks the bindings the Worker needs: each site's MEDIA and DRAFTS buckets
 * (`sites`: their binding names, MEDIA and DRAFTS for one site), KV, the edit
 * locks and the rate limits. Returns problems as readable lines.
 */
export function checkBindings(target: Table, where: string, sites: { media: string; drafts: string }[] = [siteBindings(SINGLE_SITE_ID, false)]): string[] {
  const problems: string[] = [];
  const r2 = asArray(target.r2_buckets);
  const used = new Map<string, string>();
  for (const site of sites) {
    for (const b of [site.media, site.drafts]) {
      const found = r2.find((x) => x.binding === b);
      if (!found) problems.push(`${where}: missing [[r2_buckets]] with binding = "${b}"`);
      else if (!found.bucket_name) problems.push(`${where}: the ${b} bucket has no bucket_name`);
      else {
        // A bucket belongs to one site, as its MEDIA or its DRAFTS: DRAFTS is private, MEDIA is public.
        const bucket = `${String(found.bucket_name)}${found.jurisdiction ? ` (${String(found.jurisdiction)})` : ""}`;
        const other = used.get(bucket);
        if (other) problems.push(`${where}: ${other} and ${b} must be different buckets, but both are ${bucket}`);
        used.set(bucket, b);
      }
    }
  }
  const kv = asArray(target.kv_namespaces).find((x) => x.binding === "KV");
  if (!kv) problems.push(`${where}: missing [[kv_namespaces]] with binding = "KV"`);
  else if (!kv.id || /^0+$/.test(String(kv.id))) problems.push(`${where}: the KV namespace id is still a placeholder; run \`npm run setup\``);
  const dos = asArray((target.durable_objects as Table | undefined)?.bindings);
  if (!dos.some((x) => x.name === "LOCKS" && x.class_name === "EditLocks")) {
    problems.push(`${where}: missing [[durable_objects.bindings]] name = "LOCKS", class_name = "EditLocks"`);
  }
  const rl = asArray(target.ratelimits);
  for (const name of RATE_LIMITS) if (!rl.some((x) => x.name === name)) problems.push(`${where}: missing [[ratelimits]] name = "${name}"`);
  return problems;
}
