// SPDX-License-Identifier: MIT
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { parse, TomlError } from "smol-toml";
import { buildDeployment, type Deployment, SINGLE_SITE_ID, siteBindings } from "../../src/shared/config/deployment";
import { type AlasinConfig, ConfigError, parseConfig, selectEnvironment } from "../../src/shared/config/schema";
import { migrateAlasinToml } from "./migrate";

export function displayPath(p: string): string {
  const rel = relative(process.cwd(), p);
  return rel.startsWith("..") ? p : rel || p;
}

export function readToml(path: string): Record<string, unknown> {
  if (!existsSync(path)) throw new ConfigError(`${displayPath(path)} not found. Run \`npm run setup\` to create it.`, []);
  try {
    return parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch (err) {
    if (err instanceof TomlError) {
      throw new ConfigError(`${displayPath(path)} is not valid TOML (line ${err.line}, column ${err.column}): ${err.message.split("\n")[0]}`, []);
    }
    throw err;
  }
}

/** Reads, merges the environment and validates alasin.toml. */
export function loadAlasinConfig(path: string, env: string | undefined): AlasinConfig {
  const raw = readToml(path);
  const label = env ? `${displayPath(path)} [env.${env}]` : displayPath(path);
  try {
    return parseConfig(selectEnvironment(raw, env), label);
  } catch (err) {
    // A file written for an older Alasin version: setup can update it.
    if (err instanceof ConfigError && migrateAlasinToml(readFileSync(path, "utf8")).changes.length) {
      throw new ConfigError(`${err.message}
${displayPath(path)} is from an older Alasin version. Run \`npm run setup\` to update it.`, err.issues);
    }
    throw err;
  }
}

/** The folder of a deployment's sites: sites/ next to its alasin.toml. */
export const sitesDir = (configPath: string) => join(dirname(configPath), "sites");

/**
 * The deployment (#325): alasin.toml alone is its one site; with a sites/
 * folder next to it, each sites/<id>.toml is a site, merged with alasin.toml.
 */
export function loadDeployment(path: string, env: string | undefined): Deployment {
  const dir = sitesDir(path);
  if (!existsSync(dir)) return { multi: false, sites: [{ id: SINGLE_SITE_ID, config: loadAlasinConfig(path, env), ...siteBindings(SINGLE_SITE_ID, false) }] };
  const base = selectEnvironment(readToml(path), env);
  const sites: Record<string, Record<string, unknown>> = {};
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".toml"))) {
    sites[name.slice(0, -".toml".length)] = selectEnvironment(readToml(join(dir, name)), env);
  }
  return buildDeployment(base, sites, env ? `${displayPath(path)} [env.${env}]` : displayPath(path));
}
