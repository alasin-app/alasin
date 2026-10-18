// SPDX-License-Identifier: MIT
// What `npm run create-site` creates for a site, and how each item stands:
// names derived from the site repository and the Alasin name, and a plan that
// tells new items from ones this deployment made earlier and ones that exist
// but weren't made by it (possibly a live site: warned about, never changed).
//
// No file, network or process access here, so tests can use it.

export type Environment = "production" | "dev";

/** What create-site asked, and what it made: deployments/<site>/create-site.json. No secrets. */
export interface SiteState {
  version: 1;
  owner: string;
  repo: string;
  alasinName: string;
  environments: Environment[];
  /** R2 jurisdiction of new buckets ("" for none). */
  jurisdiction: string;
  /** Production custom domains. */
  domains: { site?: string; app?: string; media?: string };
  /** Keys of the items create-site made (see Item.key). */
  created: string[];
}

export interface Item {
  /** e.g. "repo", "bucket:my-site-media", "worker:my-site", "domain:www.example.com". */
  key: string;
  kind: "repo" | "bucket" | "worker" | "domain";
  name: string;
  /** What it's for, in the plan. */
  role: string;
}

/** Whether an item exists: true, false, or null when it couldn't be checked. */
export type Existing = Map<string, boolean | null>;

export type Status = "new" | "ours" | "not-ours" | "unknown";

export interface PlannedItem extends Item {
  status: Status;
}

const GITHUB_OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const GITHUB_REPO = /^(?!\.\.?$)[A-Za-z0-9._-]{1,100}$/;
const HOSTNAME = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** "owner/name" → its parts, or an error message. */
export function parseRepository(value: string): { owner: string; repo: string } | string {
  const m = /^([^/\s]+)\/([^/\s]+)$/.exec(value.trim());
  if (!m) return "write it as owner/name";
  const [, owner, repo] = m;
  if (!GITHUB_OWNER.test(owner!)) return `"${owner}" isn't a GitHub account or organisation name`;
  if (!GITHUB_REPO.test(repo!)) return `"${repo}" isn't a GitHub repository name`;
  return { owner: owner!, repo: repo! };
}

export const hostnameProblem = (host: string): string | null => (HOSTNAME.test(host) ? null : "a hostname like www.example.com");

/** The longest suffix added to the base name ("-dev-drafts"): bucket names are at most 63 characters. */
const LONGEST_SUFFIX = "-dev-drafts".length;

/** A Cloudflare-safe name: lower case letters, digits and single hyphens, short enough for every suffix. */
export function cloudflareName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63 - LONGEST_SUFFIX)
    .replace(/-+$/, "");
}

/** Every item create-site makes for these answers, in the order it makes them. */
export function siteItems(state: Pick<SiteState, "owner" | "repo" | "alasinName" | "environments" | "domains">): Item[] {
  const site = cloudflareName(state.repo);
  const alasin = cloudflareName(state.alasinName);
  const items: Item[] = [{ key: "repo", kind: "repo", name: `${state.owner}/${state.repo}`, role: "site repository (private; main and dev branches)" }];
  const bucket = (name: string, role: string) => items.push({ key: `bucket:${name}`, kind: "bucket", name, role });
  const worker = (name: string, role: string) => items.push({ key: `worker:${name}`, kind: "worker", name, role });
  const domain = (name: string | undefined, role: string) => name && items.push({ key: `domain:${name}`, kind: "domain", name, role });

  const prod = state.environments.includes("production");
  const dev = state.environments.includes("dev");
  if (prod) {
    bucket(`${site}-media`, "production media (public)");
    bucket(`${site}-drafts`, "production drafts (private)");
  }
  if (dev) {
    bucket(`${site}-dev-media`, "dev media (public r2.dev URL)");
    bucket(`${site}-dev-drafts`, "dev drafts (private)");
  }
  worker(site, prod ? "site Worker (main → production; dev branch → dev preview)" : "site Worker (dev branch preview)");
  if (prod) worker(alasin, "Alasin, production");
  if (dev) worker(`${alasin}-dev`, "Alasin, dev");
  if (prod) {
    domain(state.domains.site, "production site");
    domain(state.domains.app, "production Alasin");
    domain(state.domains.media, "production media");
  }
  return items;
}

/** Each item with its status: new, made by this deployment, or existing but not made by it. */
export function planItems(items: Item[], existing: Existing, created: string[]): PlannedItem[] {
  const ours = new Set(created);
  return items.map((item) => {
    const exists = existing.get(item.key);
    const status: Status = exists === null || exists === undefined ? "unknown" : !exists ? "new" : ours.has(item.key) ? "ours" : "not-ours";
    return { ...item, status };
  });
}

const STATUS_TEXT: Record<Status, string> = {
  new: "will be created",
  ours: "already there (made by this deployment), kept",
  "not-ours": "EXISTS, not made by this deployment: reused only, never changed",
  unknown: "couldn't be checked",
};

/** The plan, one line per item. */
export function planLines(plan: PlannedItem[]): string[] {
  const width = Math.max(...plan.map((p) => p.name.length));
  return plan.map((p) => `${p.name.padEnd(width)}  ${p.role}: ${STATUS_TEXT[p.status]}`);
}

/** The warning for items that exist but weren't made by this deployment; null if there are none. */
export function alreadyDeployedWarning(plan: PlannedItem[]): string | null {
  const foreign = plan.filter((p) => p.status === "not-ours");
  if (!foreign.length) return null;
  const where = (p: PlannedItem) => (p.kind === "repo" ? "on GitHub" : p.kind === "domain" ? "in DNS" : "in Cloudflare");
  return [
    "Some of this site already exists, and wasn't made by this deployment:",
    ...foreign.map((p) => `  - ${p.name} (${p.role.replace(/ \(.*\)$/, "")}) ${where(p)}`),
    "This may be a live site, possibly production. create-site would only reuse these, never change or overwrite them:",
    "no commits to a repository with content, no changes to existing domains, no writes to buckets that aren't empty.",
  ].join("\n");
}
