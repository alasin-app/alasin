// SPDX-License-Identifier: MIT
//
// A deployment's sites (#325). alasin.toml alone is one site, as before. With
// a sites/ folder, each sites/<id>.toml is a site: its configuration is
// alasin.toml merged with that file, so alasin.toml holds what every site
// shares (and defaults for them). The build validates every site and injects
// them all as ALASIN_CONFIG_JSON.

import { type AlasinConfig, ConfigError, deepMerge, parseConfig } from "./schema";

export interface SiteEntry {
  /** Names the site in paths (/<id>/…, /api/sites/<id>/…) and in what's kept per site. */
  id: string;
  config: AlasinConfig;
  /** Worker binding names of the site's MEDIA and DRAFTS buckets. */
  media: string;
  drafts: string;
}

export interface Deployment {
  /** Sites from sites/: paths name the site. Without, the one site keeps the paths it always had. */
  multi: boolean;
  sites: SiteEntry[];
}

/** The id of the one site of an alasin.toml without sites/. */
export const SINGLE_SITE_ID = "site";

/** A site id: the file name in sites/, lower-case letters, digits and hyphens. */
export const SITE_ID = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

/** The first parts of the app's own paths, which a site id can't be. */
export const RESERVED_SITE_IDS = new Set(["api", "auth", "assets", "sites", "edit", "drafts", "posts", "pages", "categories", "media", "bin", "users", "more"]);

/** Sections every site shares: they come from alasin.toml only. */
const APP_WIDE = ["app", "ui", "security"] as const;
/** Keys of [github] every site shares: one GitHub App. */
const APP_WIDE_GITHUB = ["app_id", "client_id"] as const;

/** The binding names of a site's buckets: MEDIA and DRAFTS for the one site, MEDIA_<ID> and DRAFTS_<ID> for sites from sites/. */
export function siteBindings(id: string, multi: boolean): { media: string; drafts: string } {
  if (!multi) return { media: "MEDIA", drafts: "DRAFTS" };
  const suffix = id.toUpperCase().replace(/-/g, "_");
  return { media: `MEDIA_${suffix}`, drafts: `DRAFTS_${suffix}` };
}

type Raw = Record<string, unknown>;

/** Problems with a site id, for messages; none if it's fine. */
export function siteIdProblem(id: string): string | null {
  if (!SITE_ID.test(id)) return "use lower-case letters, digits and hyphens, at most 32";
  if (RESERVED_SITE_IDS.has(id)) return "is one of the app's own paths";
  return null;
}

/**
 * A deployment from alasin.toml (`base`, its environment already applied) and
 * the sites/ files (`sites`, id → content, environments applied). No sites:
 * alasin.toml is the one site. Throws ConfigError listing what's wrong.
 */
export function buildDeployment(base: Raw, sites: Record<string, Raw> | null, source = "alasin.toml"): Deployment {
  if (!sites) return { multi: false, sites: [{ id: SINGLE_SITE_ID, config: parseConfig(base, source), ...siteBindings(SINGLE_SITE_ID, false) }] };
  const ids = Object.keys(sites).sort();
  if (!ids.length) throw new ConfigError("sites/ has no <id>.toml files: add one per site, or remove the folder to use alasin.toml alone.", []);
  const entries = ids.map((id) => {
    const file = `sites/${id}.toml`;
    const problem = siteIdProblem(id);
    if (problem) throw new ConfigError(`${file}: the file name is the site's id: ${problem}.`, [`${file}: ${problem}`]);
    const raw = sites[id]!;
    const shared = [
      ...APP_WIDE.filter((k) => k in raw).map((k) => `[${k}]`),
      ...APP_WIDE_GITHUB.filter((k) => k in ((raw.github as Raw | undefined) ?? {})).map((k) => `github.${k}`),
    ];
    if (shared.length) {
      throw new ConfigError(`${file}: ${shared.join(", ")} can only be set in alasin.toml: every site shares them.`, shared.map((s) => `${file}: ${s}`));
    }
    return { id, config: parseConfig(deepMerge(base, raw), `${file} (with ${source})`), ...siteBindings(id, true) };
  });
  const repos = new Map<string, string>();
  for (const s of entries) {
    const repo = `${s.config.github.owner}/${s.config.github.repo}@${s.config.github.branch}`.toLowerCase();
    const other = repos.get(repo);
    if (other) throw new ConfigError(`sites/${s.id}.toml and sites/${other}.toml are the same site repository and branch.`, []);
    repos.set(repo, s.id);
  }
  return { multi: true, sites: entries };
}

/** The deployment as the Worker gets it: ALASIN_CONFIG_JSON. */
export function serializeDeployment(d: Deployment): string {
  return JSON.stringify({ multi: d.multi, sites: d.sites });
}

/** ALASIN_CONFIG_JSON, validated again. Also accepts a lone configuration (from before #325), as the one site. */
export function parseDeployment(json: string, source = "ALASIN_CONFIG_JSON"): Deployment {
  const raw = JSON.parse(json) as Raw;
  if (!Array.isArray(raw.sites)) return buildDeployment(raw, null, source);
  const multi = raw.multi === true;
  const sites = (raw.sites as Raw[]).map((s) => {
    const id = String(s.id);
    const bindings = siteBindings(id, multi);
    return { id, config: parseConfig(s.config, `${source} (${id})`), media: String(s.media ?? bindings.media), drafts: String(s.drafts ?? bindings.drafts) };
  });
  if (!sites.length) throw new ConfigError(`${source} has no sites`, []);
  return { multi, sites };
}
