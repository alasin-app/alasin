// SPDX-License-Identifier: MIT
// Builds the Wrangler configuration actually passed to `wrangler dev|deploy`:
// the operator's wrangler.toml plus what Alasin manages itself (entry point,
// static assets, the validated alasin.toml as a variable, the version). It is
// written to .alasin/ (gitignored) so the operator's file stays untouched and
// may live outside this repository.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AlasinConfig } from "../../src/shared/config/schema";
import { ConfigError } from "../../src/shared/config/schema";
import { repoRoot } from "./args";
import { displayPath, readToml } from "./config";

type Table = Record<string, unknown>;

export const REQUIRED_SECRETS = ["SESSION_KEY", "TOKEN_KEY", "GITHUB_CLIENT_SECRET", "GITHUB_APP_PRIVATE_KEY"] as const;
const RATE_LIMITS = ["RL_AUTH", "RL_UPLOAD", "RL_COMMIT"];

export function packageVersion(): string {
  return (JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { version: string }).version;
}

function asArray(v: unknown): Table[] {
  return Array.isArray(v) ? (v as Table[]) : [];
}

/** Checks the bindings the Worker needs. Returns problems as readable lines. */
export function checkBindings(target: Table, where: string): string[] {
  const problems: string[] = [];
  const r2 = asArray(target.r2_buckets);
  for (const b of ["MEDIA", "DRAFTS"]) {
    const found = r2.find((x) => x.binding === b);
    if (!found) problems.push(`${where}: missing [[r2_buckets]] with binding = "${b}"`);
    else if (!found.bucket_name) problems.push(`${where}: the ${b} bucket has no bucket_name`);
  }
  const media = r2.find((x) => x.binding === "MEDIA");
  const drafts = r2.find((x) => x.binding === "DRAFTS");
  if (media && drafts && media.bucket_name === drafts.bucket_name && media.jurisdiction === drafts.jurisdiction) {
    problems.push(`${where}: MEDIA and DRAFTS must be different buckets (DRAFTS is private, MEDIA is public)`);
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

export interface GeneratedConfig {
  path: string;
  workerName: string;
}

export function generateWranglerConfig(opts: {
  wranglerPath: string;
  env: string | undefined;
  config: AlasinConfig;
  outName: string;
}): GeneratedConfig {
  const raw = readToml(opts.wranglerPath);
  const label = displayPath(opts.wranglerPath);
  for (const key of ["main", "assets", "vars", "define"]) {
    if (key in raw) throw new ConfigError(`${label}: remove \`${key}\`; npm run build|dev|deploy sets it`, []);
  }
  if (!Array.isArray(raw.migrations) || !raw.migrations.length) {
    throw new ConfigError(`${label}: missing the [[migrations]] for the EditLocks Durable Object (see wrangler.example.toml)`, []);
  }

  const managed = {
    vars: { ALASIN_CONFIG_JSON: JSON.stringify(opts.config) },
    // The nightly cleanup of the DRAFTS bucket.
    triggers: { crons: [opts.config.drafts.cleanup_cron] },
    define: { __ALASIN_VERSION__: JSON.stringify(packageVersion()) },
  };
  // Preview URLs would be extra hostnames running this Worker with the same
  // bindings and secrets; Alasin serves one canonical origin, so they're off
  // unless wrangler.toml enables them explicitly.
  const previewUrls = (table: Table) => ("preview_urls" in table ? {} : { preview_urls: false });
  const out: Table = {
    ...raw,
    main: join(repoRoot, "src/worker/index.ts"),
    assets: {
      directory: join(repoRoot, "dist/web"),
      binding: "ASSETS",
      // The Worker runs first so it can add security headers and redirect to the canonical origin.
      run_worker_first: true,
      not_found_handling: "single-page-application",
    },
  };

  let target: Table;
  let workerName: string;
  if (opts.env) {
    const envs = (raw.env ?? {}) as Table;
    const envTable = envs[opts.env] as Table | undefined;
    if (!envTable) throw new ConfigError(`${label} has no [env.${opts.env}] table (see wrangler.example.toml)`, []);
    for (const key of ["vars", "define"]) {
      if (key in envTable) throw new ConfigError(`${label}: remove \`env.${opts.env}.${key}\`; npm run build|dev|deploy sets it`, []);
    }
    target = envTable;
    workerName = String(envTable.name ?? `${String(raw.name)}-${opts.env}`);
    out.env = { [opts.env]: { ...envTable, ...previewUrls(envTable), ...managed } };
  } else {
    target = raw;
    workerName = String(raw.name);
    delete out.env;
    Object.assign(out, previewUrls(raw), managed);
  }
  const problems = checkBindings(target, opts.env ? `${label} [env.${opts.env}]` : label);
  if (problems.length) throw new ConfigError(`${label} is not complete:\n${problems.map((p) => `  - ${p}`).join("\n")}`, problems);

  const dir = join(repoRoot, ".alasin");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `wrangler.${opts.outName}.json`);
  writeFileSync(path, JSON.stringify(out, null, 2));
  return { path, workerName };
}
