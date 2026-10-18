// SPDX-License-Identifier: MIT
// What `npm run create-site` creates for a site, and how each item stands:
// names derived from the site repository and the Alasin name, and a plan that
// tells new items from ones this deployment made earlier and ones that exist
// but weren't made by it (possibly a live site: warned about, never changed).
//
// A site deployed earlier (before create-site, or by hand) keeps its own
// names: they're read from deployments/<repo>/wrangler.toml and the site
// repository's Wrangler file, and used instead of derived ones, so no second
// set is planned.
//
// No file, network or process access here, so tests can use it.

import { parse as parseToml } from "smol-toml";

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
  /** The site's title and Hugo locale, for the skeleton. */
  title?: string;
  language?: string;
  /** The dev media bucket's public r2.dev URL, once it's turned on. */
  devMediaUrl?: string;
  /** Keys of the items create-site made (see Item.key). */
  created: string[];
}

/** What an item is for, independent of its name. */
export type Slot =
  | "repo"
  | "media:production"
  | "drafts:production"
  | "media:dev"
  | "drafts:dev"
  | "site-worker"
  | "alasin:production"
  | "alasin:dev"
  | "domain:site"
  | "domain:app"
  | "domain:media";

/** Names an existing deployment already uses, with the file each came from. */
export type KnownNames = Partial<Record<Slot, { name: string; source: string; jurisdiction?: string }>>;

export interface Item {
  slot: Slot;
  /** e.g. "repo", "bucket:my-site-media", "worker:my-site", "domain:www.example.com". */
  key: string;
  kind: "repo" | "bucket" | "worker" | "domain";
  name: string;
  /** What it's for, in the plan. */
  role: string;
  /** Where the name came from, when an existing deployment already uses it. */
  deployed?: string;
  /** An existing bucket's own jurisdiction (otherwise the answered one). */
  jurisdiction?: string;
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

/**
 * Every item create-site makes for these answers, in the order it makes them.
 * A name an existing deployment already uses (`known`) replaces the derived one.
 */
export function siteItems(state: Pick<SiteState, "owner" | "repo" | "alasinName" | "environments" | "domains">, known: KnownNames = {}): Item[] {
  const site = cloudflareName(state.repo);
  const alasin = cloudflareName(state.alasinName);
  const items: Item[] = [];
  const add = (slot: Slot, kind: Item["kind"], derived: string | undefined, role: string) => {
    const name = known[slot]?.name ?? derived;
    if (!name) return;
    const key = kind === "repo" ? "repo" : `${kind}:${name}`;
    const k = known[slot];
    items.push({ slot, key, kind, name, role, ...(k ? { deployed: k.source } : {}), ...(k?.jurisdiction !== undefined ? { jurisdiction: k.jurisdiction } : {}) });
  };

  const prod = state.environments.includes("production");
  const dev = state.environments.includes("dev");
  add("repo", "repo", `${state.owner}/${state.repo}`, "site repository (private; main and dev branches)");
  if (prod) {
    add("media:production", "bucket", `${site}-media`, "production media (public)");
    add("drafts:production", "bucket", `${site}-drafts`, "production drafts (private)");
  }
  if (dev) {
    add("media:dev", "bucket", `${site}-dev-media`, "dev media (public r2.dev URL)");
    add("drafts:dev", "bucket", `${site}-dev-drafts`, "dev drafts (private)");
  }
  add("site-worker", "worker", site, prod ? "site Worker (main → production; dev branch → dev preview)" : "site Worker (dev branch preview)");
  if (prod) add("alasin:production", "worker", alasin, "Alasin, production");
  if (dev) add("alasin:dev", "worker", `${alasin}-dev`, "Alasin, dev");
  if (prod) {
    add("domain:site", "domain", state.domains.site, "production site");
    add("domain:app", "domain", state.domains.app, "production Alasin");
    add("domain:media", "domain", state.domains.media, "production media");
  }
  return items;
}

type Table = Record<string, unknown>;
const table = (v: unknown): Table => (v && typeof v === "object" && !Array.isArray(v) ? (v as Table) : {});
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

/** The Alasin Workers and their MEDIA / DRAFTS buckets in a deployment's wrangler.toml (production and [env.dev]). */
export function namesFromAlasinWrangler(wrangler: Table, source: string): KnownNames {
  const known: KnownNames = {};
  const take = (slot: Slot, name: string | undefined, jurisdiction?: string) => name && (known[slot] = { name, source, ...(jurisdiction !== undefined ? { jurisdiction } : {}) });
  const buckets = (t: Table, env: "production" | "dev") => {
    for (const b of Array.isArray(t.r2_buckets) ? t.r2_buckets : []) {
      const { binding, bucket_name, jurisdiction } = table(b);
      const j = str(jurisdiction) ?? "";
      if (binding === "MEDIA") take(`media:${env}`, str(bucket_name), j);
      if (binding === "DRAFTS") take(`drafts:${env}`, str(bucket_name), j);
    }
  };
  take("alasin:production", str(wrangler.name));
  buckets(wrangler, "production");
  const dev = table(table(wrangler.env).dev);
  take("alasin:dev", str(dev.name));
  buckets(dev, "dev");
  return known;
}

/** JSONC → JSON: drops comments and trailing commas, leaving strings (e.g. URLs with //) alone. */
export function stripJsonc(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '"') {
      const start = i;
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === "\\") i++;
      out += text.slice(start, i + 1);
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2);
      if (i === -1) break;
      i++;
    } else out += c;
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

/** The Worker name in a site repository's wrangler.jsonc / wrangler.json / wrangler.toml; null if none can be read. */
export function siteWorkerName(file: string, text: string): string | null {
  try {
    const config = file.endsWith(".toml") ? (parseToml(text) as Table) : (JSON.parse(stripJsonc(text)) as Table);
    return str(config.name) ?? null;
  } catch {
    return null;
  }
}

/**
 * Each item with its status: new, made by this deployment, or existing but not
 * made by it. A domain this deployment added counts as its own even before DNS
 * finds it; a bucket or repository it made that's gone is new again.
 */
export function planItems(items: Item[], existing: Existing, created: string[]): PlannedItem[] {
  const ours = new Set(created);
  return items.map((item) => {
    const exists = existing.get(item.key);
    const pendingDomain = item.kind === "domain" && ours.has(item.key) && exists !== true;
    const status: Status = pendingDomain
      ? "ours"
      : exists === null || exists === undefined
        ? "unknown"
        : !exists
          ? "new"
          : ours.has(item.key)
            ? "ours"
            : "not-ours";
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
  return plan.map((p) => `${p.name.padEnd(width)}  ${p.role}${p.deployed ? ` [as in ${p.deployed}]` : ""}: ${STATUS_TEXT[p.status]}`);
}

/** The warning for items that exist but weren't made by this deployment; null if there are none. */
export function alreadyDeployedWarning(plan: PlannedItem[]): string | null {
  const foreign = plan.filter((p) => p.status === "not-ours");
  if (!foreign.length) return null;
  const where = (p: PlannedItem) => (p.kind === "repo" ? "on GitHub" : p.kind === "domain" ? "in DNS" : "in Cloudflare");
  const sources = [...new Set(plan.flatMap((p) => (p.deployed ? [p.deployed] : [])))];
  return [
    ...(sources.length ? [`This site is already deployed: its own names are taken from ${sources.join(" and ")}, so no second set is planned.`] : []),
    "Some of this site already exists, and wasn't made by this deployment:",
    ...foreign.map((p) => `  - ${p.name} (${p.role.replace(/ \(.*\)$/, "")}) ${where(p)}`),
    "This may be a live site, possibly production. create-site would only reuse these, never change or overwrite them:",
    "no commits to a repository with content, no changes to existing domains, no writes to buckets that aren't empty.",
  ].join("\n");
}

/** Zones a hostname may belong to, most specific first: img.a.example.com → a.example.com, example.com (and itself). */
export function zoneCandidates(host: string): string[] {
  const labels = host.split(".");
  return labels.slice(0, -1).map((_, i) => labels.slice(i).join("."));
}

/** The public r2.dev URL in Wrangler's output, ending in "/"; null if there is none. */
export function r2DevUrl(output: string): string | null {
  const m = /https:\/\/pub-[0-9a-f]+\.r2\.dev/.exec(output);
  return m ? `${m[0]}/` : null;
}

/** The skeleton's placeholder values for a site (see scripts/lib/skeleton.ts). */
export function skeletonValuesFor(state: SiteState, items: Item[]): Record<string, string> {
  const prod = state.environments.includes("production");
  const devMedia = state.devMediaUrl ?? "";
  const media = prod && state.domains.media ? `https://${state.domains.media}/` : devMedia;
  const worker = items.find((i) => i.slot === "site-worker")?.name;
  if (!worker) throw new Error("No site Worker in the plan");
  if (!media) throw new Error("No media URL yet: the media bucket's address must exist before the site does");
  return {
    // Without production, main isn't the public site: root-relative links.
    SITE_URL: prod && state.domains.site ? `https://${state.domains.site}` : "",
    SITE_TITLE: state.title || state.repo,
    LANGUAGE: state.language || "en",
    MEDIA_URL: media,
    DEV_MEDIA_URL: devMedia || media,
    SITE_WORKER: worker,
    MODULE_PATH: `github.com/${state.owner}/${state.repo}`,
  };
}
