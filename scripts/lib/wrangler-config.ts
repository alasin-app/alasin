// SPDX-License-Identifier: MIT
// Builds the Wrangler configuration actually passed to `wrangler dev|deploy`:
// the operator's wrangler.toml plus what Alasin manages itself (entry point,
// static assets, the validated sites as a variable, the version). It is
// written to .alasin/ (gitignored) so the operator's file stays untouched and
// may live outside this repository.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Deployment, serializeDeployment } from "../../src/shared/config/deployment";
import { ConfigError } from "../../src/shared/config/schema";
import { repoRoot } from "./args";
import { checkBindings } from "./bindings";

export { checkBindings };
import { displayPath, readToml } from "./config";

type Table = Record<string, unknown>;

export const REQUIRED_SECRETS = ["SESSION_KEY", "TOKEN_KEY", "GITHUB_CLIENT_SECRET", "GITHUB_APP_PRIVATE_KEY"] as const;

export function packageVersion(): string {
  return (JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { version: string }).version;
}

export interface GeneratedConfig {
  path: string;
  workerName: string;
}

export function generateWranglerConfig(opts: {
  wranglerPath: string;
  env: string | undefined;
  deployment: Deployment;
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
    vars: { ALASIN_CONFIG_JSON: serializeDeployment(opts.deployment) },
    // The nightly cleanup of each site's DRAFTS bucket.
    triggers: { crons: [...new Set(opts.deployment.sites.map((s) => s.config.drafts.cleanup_cron))] },
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
  const problems = checkBindings(target, opts.env ? `${label} [env.${opts.env}]` : label, opts.deployment.sites);
  if (problems.length) throw new ConfigError(`${label} is not complete:\n${problems.map((p) => `  - ${p}`).join("\n")}`, problems);

  const dir = join(repoRoot, ".alasin");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `wrangler.${opts.outName}.json`);
  writeFileSync(path, JSON.stringify(out, null, 2));
  return { path, workerName };
}
