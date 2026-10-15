// SPDX-License-Identifier: MIT
// Shared command-line options of the Alasin scripts:
//   --env <name>              Wrangler / alasin.toml environment (e.g. dev)
//   --config <path>           alasin.toml (default: $ALASIN_CONFIG, then ./alasin.toml)
//   --wrangler-config <path>  wrangler.toml (default: $WRANGLER_CONFIG, then next to alasin.toml)

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { swallowedOptions, swallowedOptionsMessage } from "./npm-args";

export const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), "../..");

export interface CommonArgs {
  env?: string;
  configPath: string;
  wranglerPath: string;
  rest: string[];
  flags: Set<string>;
}

export function parseArgs(argv: string[]): CommonArgs {
  const swallowed = swallowedOptions(process.env);
  if (swallowed.length) throw new Error(swallowedOptionsMessage(process.env.npm_lifecycle_event ?? "<script>", swallowed));
  let env: string | undefined;
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
  const explicitConfig = config ?? process.env.ALASIN_CONFIG;
  const configPath = resolve(explicitConfig ?? join(repoRoot, "alasin.toml"));
  // A deployment's two files belong together: next to an explicitly given alasin.toml.
  const sibling = join(dirname(configPath), "wrangler.toml");
  const wranglerPath = resolve(
    wrangler ?? process.env.WRANGLER_CONFIG ?? (explicitConfig || existsSync(sibling) ? sibling : join(repoRoot, "wrangler.toml")),
  );
  return { env, configPath, wranglerPath, rest, flags };
}
