// SPDX-License-Identifier: MIT
// wrangler.toml sections for a second deployment ([env.<name>]), used by
// `npm run setup -- --env <name>` and by create-site. No file access, so tests
// can use it.

type Table = Record<string, unknown>;

export interface Bucket {
  name: string;
  jurisdiction?: string;
}

/**
 * A wrangler.toml [env.<name>] section: its own Worker, buckets, KV namespace,
 * Durable Object and rate limits. Without `buckets`, MEDIA is the base's (a dev
 * app next to production on the same site) and DRAFTS a placeholder setup asks
 * for; create-site gives the environment's own buckets.
 */
export function envWranglerSection(
  name: string,
  base: Table,
  opts: { worker?: string; buckets?: { media: Bucket; drafts: Bucket } } = {},
): string {
  const envs = Object.keys((base.env as Table | undefined) ?? {}).length;
  const ns = (n: number) => String(1000 * (envs + 2) + n);
  const baseMedia = ((base.r2_buckets as Table[] | undefined) ?? []).find((b) => b.binding === "MEDIA") ?? {};
  const media: Bucket = opts.buckets?.media ?? { name: String(baseMedia.bucket_name ?? "example-media"), ...(baseMedia.jurisdiction ? { jurisdiction: String(baseMedia.jurisdiction) } : {}) };
  const drafts: Bucket = opts.buckets?.drafts ?? { name: "example-media-drafts" };
  const j = (b: Bucket) => (b.jurisdiction ? `\njurisdiction = ${JSON.stringify(b.jurisdiction)}` : "");
  return `# --- [env.${name}] - added by npm run setup -- --env ${name} ---
[env.${name}]
name = ${JSON.stringify(opts.worker ?? `${String(base.name ?? "alasin")}-${name}`)}
workers_dev = true

[[env.${name}.r2_buckets]]
binding = "MEDIA"
bucket_name = ${JSON.stringify(media.name)}${j(media)}

[[env.${name}.r2_buckets]]
binding = "DRAFTS"
bucket_name = ${JSON.stringify(drafts.name)}${j(drafts)}

[[env.${name}.kv_namespaces]]
binding = "KV"
id = "00000000000000000000000000000000"

[[env.${name}.durable_objects.bindings]]
name = "LOCKS"
class_name = "EditLocks"

[[env.${name}.ratelimits]]
name = "RL_AUTH"
namespace_id = "${ns(1)}"
simple = { limit = 10, period = 60 }

[[env.${name}.ratelimits]]
name = "RL_UPLOAD"
namespace_id = "${ns(2)}"
simple = { limit = 120, period = 60 }

[[env.${name}.ratelimits]]
name = "RL_COMMIT"
namespace_id = "${ns(3)}"
simple = { limit = 30, period = 60 }
`;
}
