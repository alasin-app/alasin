// SPDX-License-Identifier: MIT
// What removing a site removes (npm run create-site -- --site <site> --remove,
// or --remove-dev for its dev environment only): only items this site's
// create-site made, recorded in create-site.json; everything else is kept.
//
// No file, network or process access here, so tests can use it.

import type { Item, SiteState } from "./create-site";

export type RemoveMode = "all" | "dev";

export interface RemovalStep {
  /** The item's key in create-site.json, or a step of its own (e.g. "github-app:dev"). */
  key: string;
  kind: "alasin" | "github-app" | "site-worker" | "bucket" | "repo" | "dev-branch" | "local";
  name: string;
  /** What happens, for the plan. */
  action: string;
  /** False: not made by create-site (or not part of this removal), so kept. */
  remove: boolean;
  env?: "production" | "dev";
}

const made = (state: SiteState, key: string) => state.created.includes(key) || state.created.includes(`pending:${key}`);

/** The removal, in the order it's done. */
export function removalSteps(state: SiteState, items: Item[], mode: RemoveMode): RemovalStep[] {
  const steps: RemovalStep[] = [];
  const item = (slot: Item["slot"]) => items.find((i) => i.slot === slot);
  const dev = mode === "dev";
  const envs: ("production" | "dev")[] = dev ? ["dev"] : (["production", "dev"] as const).filter((e) => state.environments.includes(e));
  const add = (i: Item | undefined, kind: RemovalStep["kind"], action: string, env?: RemovalStep["env"]) => {
    if (!i) return;
    const ours = made(state, i.key);
    steps.push({ key: i.key, kind, name: i.name, action: ours ? action : "kept: not made by create-site", remove: ours, ...(env ? { env } : {}) });
  };

  for (const env of envs) {
    const domain = env === "production" && state.environments.includes("production") ? ", custom domain" : "";
    add(item(`alasin:${env}`), "alasin", `deleted, with its secrets${domain} and KV namespace`, env);
  }
  if (made(state, "config")) {
    for (const env of envs) {
      if (item(`alasin:${env}`)) steps.push({ key: `github-app:${env}`, kind: "github-app", name: `${env} GitHub App`, action: "deleted on GitHub (guided: GitHub's API can't)", remove: true, env });
    }
  }
  if (!dev) add(item("site-worker"), "site-worker", "deleted, with its Workers Builds triggers and the site's domain");
  const buckets: Item["slot"][] = dev ? ["media:dev", "drafts:dev"] : ["media:production", "drafts:production", "media:dev", "drafts:dev"];
  for (const slot of buckets) add(item(slot), "bucket", slot.startsWith("media") ? "its domain or r2.dev access turned off, emptied, deleted" : "emptied, deleted");
  if (dev) {
    if (made(state, "repo")) steps.push({ key: "dev-branch", kind: "dev-branch", name: `${state.owner}/${state.repo} dev branch`, action: "deleted (main and production stay)", remove: true });
    steps.push({ key: "local:dev", kind: "local", name: "[env.dev] in alasin.toml and wrangler.toml", action: "removed", remove: made(state, "config") });
  } else {
    add(item("repo"), "repo", "deleted on GitHub, with its history");
    steps.push({ key: "local", kind: "local", name: `deployments/${state.repo}/`, action: "deleted (configuration, site clone, .dev.vars)", remove: true });
  }
  return steps;
}

/** The plan, one line per step. */
export function removalLines(steps: RemovalStep[]): string[] {
  const width = Math.max(...steps.map((s) => s.name.length));
  return steps.map((s) => `${s.name.padEnd(width)}  ${s.action}`);
}

/** The keys create-site.json no longer records after removing the dev environment. */
export function devKeys(state: SiteState, items: Item[]): string[] {
  const slots: Item["slot"][] = ["alasin:dev", "media:dev", "drafts:dev"];
  const keys = slots.map((s) => items.find((i) => i.slot === s)?.key).filter((k): k is string => !!k);
  return state.created.filter((k) => keys.includes(k.replace(/^pending:/, "")) || k.startsWith("sample:"));
}
