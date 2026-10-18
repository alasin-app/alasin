// SPDX-License-Identifier: MIT
// Which alasin.toml and wrangler.toml a script uses. Each site someone runs
// has its own untracked folder in the Alasin clone, deployments/<site>/, with
// its alasin.toml, wrangler.toml and a clone of the site repository (site/).
//
// No file or path module access here (both are passed in), so tests can use it.

export const DEPLOYMENTS = "deployments";

/** A deployment folder's name: a GitHub repository name. */
export const SITE_NAME = /^(?!\.\.?$)[A-Za-z0-9._-]{1,100}$/;

export interface ConfigChoice {
  site?: string;
  /** True when the site was picked because it's the only deployment. */
  siteImplicit?: boolean;
  configPath: string;
  wranglerPath: string;
}

/**
 * --site <name> → deployments/<name>/alasin.toml; --config → that file; neither:
 * ./alasin.toml if it exists, else the only deployment (several: an error that
 * lists them). wrangler.toml: as given, else next to the chosen alasin.toml.
 */
export function chooseConfig(opts: {
  root: string;
  /** $ALASIN_SITE and $ALASIN_CONFIG: used when neither --site nor --config is given. */
  vars?: { site?: string; config?: string };
  /** Where relative --config and --wrangler-config paths start (the current directory). */
  cwd: string;
  site?: string;
  config?: string;
  wrangler?: string;
  exists: (path: string) => boolean;
  deployments: () => string[];
  /** node:path's join and resolve. */
  path: { join: (...parts: string[]) => string; resolve: (...parts: string[]) => string };
}): ConfigChoice {
  const { root, cwd, wrangler, exists } = opts;
  const { join, resolve } = opts.path;
  if (opts.site !== undefined && opts.config !== undefined) throw new Error("Give either --site or --config, not both.");
  // A flag wins over the other option's environment variable.
  const flagged = opts.site !== undefined || opts.config !== undefined;
  let site = flagged ? opts.site : opts.vars?.site;
  const config = flagged ? opts.config : site === undefined ? opts.vars?.config : undefined;
  if (!flagged && opts.vars?.site && opts.vars.config) throw new Error("Both ALASIN_SITE and ALASIN_CONFIG are set: unset one.");
  if (site !== undefined && !SITE_NAME.test(site)) throw new Error(`--site must be a site repository name, got "${site}"`);

  let siteImplicit = false;
  if (site === undefined && config === undefined && !exists(join(root, "alasin.toml"))) {
    const sites = opts.deployments();
    if (sites.length > 1) throw new Error(`Several deployments in ${DEPLOYMENTS}/: ${sites.join(", ")}. Choose one with --site <name>.`);
    if (sites.length === 1) {
      site = sites[0]!;
      siteImplicit = true;
    }
  }

  const given = site !== undefined ? join(root, DEPLOYMENTS, site, "alasin.toml") : config && resolve(cwd, config);
  const configPath = given ?? join(root, "alasin.toml");
  // A deployment's two files belong together: next to an explicitly given alasin.toml.
  const sibling = join(configPath, "..", "wrangler.toml");
  const wranglerPath = wrangler ? resolve(cwd, wrangler) : given || exists(sibling) ? sibling : join(root, "wrangler.toml");
  return { ...(site !== undefined ? { site, siteImplicit } : {}), configPath, wranglerPath };
}

/** "Deployment: <site>" for the scripts' output, so it's clear which site a command acts on. */
export function deploymentLine(choice: Pick<ConfigChoice, "site" | "siteImplicit">): string | null {
  if (choice.site === undefined) return null;
  return `Deployment: ${choice.site} (${DEPLOYMENTS}/${choice.site}/)${choice.siteImplicit ? ", the only one" : ""}`;
}
