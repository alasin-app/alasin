// SPDX-License-Identifier: MIT
// Shared command-line options of the Alasin scripts:
//   --env <name>              Wrangler / alasin.toml environment (e.g. dev)
//   --site <name>             the deployment in deployments/<name>/ (default: $ALASIN_SITE)
//   --config <path>           alasin.toml (default: $ALASIN_CONFIG, then ./alasin.toml)
//   --wrangler-config <path>  wrangler.toml (default: $WRANGLER_CONFIG, then next to alasin.toml)
//
// Without --site or --config: ./alasin.toml if there is one; otherwise the
// only deployment in deployments/, or an error listing them if there are several.

import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { chooseConfig, DEPLOYMENTS, SITE_NAME } from "./deployments";
import { swallowedOptions, swallowedOptionsMessage } from "./npm-args";

export const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), "../..");

export { DEPLOYMENTS, deploymentLine } from "./deployments";

/** The deployments in `<root>/deployments`: folders with an alasin.toml, sorted. */
export function listDeployments(root = repoRoot): string[] {
  const dir = join(root, DEPLOYMENTS);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && SITE_NAME.test(e.name) && existsSync(join(dir, e.name, "alasin.toml")))
    .map((e) => e.name)
    .sort();
}

export interface CommonArgs {
  env?: string;
  /** The deployment in deployments/, if one was given or is the only one. */
  site?: string;
  /** True when the site was picked because it's the only deployment. */
  siteImplicit?: boolean;
  configPath: string;
  wranglerPath: string;
  rest: string[];
  flags: Set<string>;
}

export function parseArgs(argv: string[], ctx: { env?: NodeJS.ProcessEnv; root?: string } = {}): CommonArgs {
  const vars = ctx.env ?? process.env;
  const root = ctx.root ?? repoRoot;
  const swallowed = swallowedOptions(vars);
  if (swallowed.length) throw new Error(swallowedOptionsMessage(vars.npm_lifecycle_event ?? "<script>", swallowed));
  let env: string | undefined;
  let site: string | undefined;
  let config: string | undefined;
  let wrangler: string | undefined;
  const rest: string[] = [];
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const value = () => {
      const v = argv[++i];
      if (!v) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--env" || a === "-e") env = value();
    else if (a.startsWith("--env=")) env = a.slice(6);
    else if (a === "--site") site = value();
    else if (a.startsWith("--site=")) site = a.slice(7);
    else if (a === "--config") config = value();
    else if (a.startsWith("--config=")) config = a.slice(9);
    else if (a === "--wrangler-config") wrangler = value();
    else if (a.startsWith("--wrangler-config=")) wrangler = a.slice(18);
    else if (a.startsWith("--") && !a.includes("=")) {
      flags.add(a.slice(2));
      rest.push(a);
    } else rest.push(a);
  }
  if (env !== undefined && !/^[a-z][a-z0-9-]{0,30}$/.test(env)) throw new Error(`--env must be a short lower-case name, got "${env}"`);
  const choice = chooseConfig({
    root,
    cwd: process.cwd(),
    site,
    config,
    wrangler: wrangler ?? vars.WRANGLER_CONFIG,
    vars: { site: vars.ALASIN_SITE || undefined, config: vars.ALASIN_CONFIG || undefined },
    exists: existsSync,
    deployments: () => listDeployments(root),
    path: { join, resolve },
  });
  return { env, ...choice, rest, flags };
}
