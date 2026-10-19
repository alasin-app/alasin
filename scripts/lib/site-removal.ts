// SPDX-License-Identifier: MIT
// Carries out a site's removal (see removal.ts for what's removed): only items
// this site's create-site made. Each step is taken out of create-site.json when
// it's done, so a run that stops can be repeated.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "smol-toml";
import { accountId, apiDelete, buildsToken, cloudflareApi, deleteObject, listObjects } from "./cloudflare-api";
import type { Item, PlannedItem, SiteState } from "./create-site";
import { capture } from "./proc";
import { devKeys, type RemoveMode, type RemovalStep } from "./removal";
import { removeTables } from "./toml-edit";

type Table = Record<string, unknown>;
const table = (v: unknown): Table => (v && typeof v === "object" && !Array.isArray(v) ? (v as Table) : {});

export interface RemovalContext {
  state: SiteState;
  plan: PlannedItem[];
  /** deployments/<site>/ */
  dir: string;
  save: (state: SiteState) => void;
  ask: (question: string) => Promise<string>;
  info: (msg: string) => void;
  ok: (msg: string) => void;
  warn: (msg: string) => void;
  step: (title: string) => void;
}

const jHeader = (j?: string): Record<string, string> => (j ? { "cf-r2-jurisdiction": j } : {});

function wrangler(args: string[]): string {
  const r = capture("wrangler", args);
  if (r.code !== 0) throw new Error(`wrangler ${args.slice(0, 4).join(" ")} failed:\n${(r.stderr || r.stdout).slice(-2000)}`);
  return r.stdout + r.stderr;
}

function gh(args: string[]): { status: number; out: string } {
  const r = spawnSync("gh", args, { encoding: "utf8" });
  return { status: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/** A Worker with its custom domains (the DNS records Cloudflare made for them go too) and its secrets. */
async function deleteWorker(name: string) {
  const acc = accountId();
  const domains = await cloudflareApi<{ id: string; hostname: string }[]>(`/accounts/${acc}/workers/domains?service=${encodeURIComponent(name)}`);
  for (const d of domains) await apiDelete(`/accounts/${acc}/workers/domains/${d.id}`);
  await apiDelete(`/accounts/${acc}/workers/scripts/${encodeURIComponent(name)}?force=true`);
}

/** The site Worker's Workers Builds triggers (needs the Builds token; without it they go with the Worker). */
async function deleteTriggers(worker: string, c: RemovalContext) {
  if (!process.env.CLOUDFLARE_BUILDS_TOKEN) {
    c.info("  (no CLOUDFLARE_BUILDS_TOKEN: its Workers Builds triggers go with the Worker)");
    return;
  }
  const token = buildsToken();
  const acc = accountId();
  const scripts = await cloudflareApi<{ id: string; tag: string }[]>(`/accounts/${acc}/workers/scripts`);
  const tag = scripts.find((s) => s.id === worker)?.tag;
  if (!tag) return;
  const triggers = await cloudflareApi<{ trigger_uuid: string }[]>(`/accounts/${acc}/builds/workers/${tag}/triggers`, { token }).catch(() => []);
  for (const t of triggers) await cloudflareApi(`/accounts/${acc}/builds/triggers/${t.trigger_uuid}`, { method: "DELETE", token });
}

/** An environment's GitHub App ID, from alasin.toml (the example's placeholder means none). */
function appId(dir: string, env: "production" | "dev"): number | null {
  const path = join(dir, "alasin.toml");
  if (!existsSync(path)) return null;
  const raw = parse(readFileSync(path, "utf8")) as Table;
  const github = env === "dev" ? table(table(table(raw.env).dev).github) : table(raw.github);
  const id = github.app_id;
  return typeof id === "number" && id !== 123456 ? id : null;
}

/** GitHub can't delete an app through its API: show where, wait, check it's gone. */
async function deleteGitHubApp(state: SiteState, env: "production" | "dev", c: RemovalContext) {
  const id = appId(c.dir, env);
  if (!id) {
    c.ok(`${env}: no GitHub App recorded`);
    return;
  }
  // setup's default name, "Alasin <repo>[ <env>]", as GitHub makes it a slug.
  const slug = `alasin ${state.repo}${env === "dev" ? " dev" : ""}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const lookup = async () => {
    const res = await fetch(`https://api.github.com/apps/${slug}`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "Alasin-create-site" } });
    if (res.status === 404) return null;
    return (await res.json()) as { id: number; owner?: { login: string; type: string } };
  };
  const app = await lookup();
  if (app && app.id !== id) {
    c.warn(`The ${env} GitHub App (ID ${id}) isn't named as setup names it. Delete it under https://github.com/settings/apps (Edit → Advanced → Delete GitHub App).`);
    await c.ask("Press Enter once it's deleted");
    return;
  }
  if (!app) {
    c.ok(`${env} GitHub App ${id}: already deleted`);
    return;
  }
  const base = app.owner?.type === "Organization" ? `https://github.com/organizations/${app.owner.login}/settings/apps/${slug}` : `https://github.com/settings/apps/${slug}`;
  c.info(`GitHub's API can't delete apps. Open ${base}/advanced`);
  c.info("and click Delete GitHub App, then type the app's name to confirm. Deleting it also uninstalls it.");
  for (;;) {
    await c.ask(`Press Enter once the ${env} GitHub App is deleted`);
    if (!(await lookup())) {
      c.ok(`${env} GitHub App ${id}: deleted`);
      return;
    }
    c.warn("It's still there.");
  }
}

/** A bucket: its domain or r2.dev access off, its objects, then the bucket. */
async function deleteBucket(item: PlannedItem, c: RemovalContext) {
  const j = (item.jurisdiction ?? c.state.jurisdiction) || undefined;
  const jArgs = j ? ["-J", j] : [];
  if (item.slot === "media:production" && c.state.domains.media && c.state.created.includes(`domain:${c.state.domains.media}`)) {
    wrangler(["r2", "bucket", "domain", "remove", item.name, "--domain", c.state.domains.media, ...jArgs, "-y"]);
  }
  if (item.slot === "media:dev") wrangler(["r2", "bucket", "dev-url", "disable", item.name, ...jArgs, "-y"]);
  const keys = await listObjects(item.name, j);
  for (const key of keys) await deleteObject(item.name, key, j);
  await apiDelete(`/accounts/${accountId()}/r2/buckets/${encodeURIComponent(item.name)}`, jHeader(j));
  c.ok(`${item.name}: deleted (${keys.length} objects)`);
}

/** The repository, asking gh for its delete_repo permission if it hasn't got it. */
async function deleteRepo(full: string, c: RemovalContext) {
  let r = gh(["repo", "delete", full, "--yes"]);
  if (r.status !== 0 && /delete_repo/.test(r.out)) {
    c.info("gh needs permission to delete repositories: `gh auth refresh -h github.com -s delete_repo` (opens the browser).");
    spawnSync("gh", ["auth", "refresh", "-h", "github.com", "-s", "delete_repo"], { stdio: "inherit" });
    r = gh(["repo", "delete", full, "--yes"]);
  }
  if (r.status !== 0 && !/Could not resolve|Not Found|404/.test(r.out)) throw new Error(`Deleting ${full} failed:\n${r.out.slice(-1000)}`);
  c.ok(`${full}: deleted`);
}

export async function removeSite(steps: RemovalStep[], mode: RemoveMode, items: Item[], c: RemovalContext) {
  const { state } = c;
  const forget = (key: string) => {
    state.created = state.created.filter((k) => k !== key && k !== `pending:${key}`);
    c.save(state);
  };
  const kv = (env: "production" | "dev"): string | undefined => {
    const path = join(c.dir, "wrangler.toml");
    if (!existsSync(path)) return undefined;
    const raw = parse(readFileSync(path, "utf8")) as Table;
    const t = env === "dev" && state.environments.includes("production") ? table(table(raw.env).dev) : raw;
    const ns = (Array.isArray(t.kv_namespaces) ? t.kv_namespaces : []).map(table).find((n) => n.binding === "KV");
    return typeof ns?.id === "string" && !/^0+$/.test(ns.id) ? ns.id : undefined;
  };

  for (const s of steps.filter((x) => x.remove)) {
    c.step(`${s.name}`);
    if (s.kind === "alasin") {
      const id = kv(s.env!);
      await deleteWorker(s.name);
      if (id) await apiDelete(`/accounts/${accountId()}/storage/kv/namespaces/${id}`);
      forget(s.key);
      if (s.env === "production" && state.domains.app) forget(`domain:${state.domains.app}`);
      c.ok(`${s.name}: deleted${id ? ", with its KV namespace" : ""}`);
    } else if (s.kind === "github-app") {
      await deleteGitHubApp(state, s.env!, c);
    } else if (s.kind === "site-worker") {
      await deleteTriggers(s.name, c);
      await deleteWorker(s.name);
      forget(s.key);
      if (state.domains.site) forget(`domain:${state.domains.site}`);
      forget(`builds:${s.name}`);
      c.ok(`${s.name}: deleted`);
    } else if (s.kind === "bucket") {
      await deleteBucket(c.plan.find((p) => p.key === s.key)!, c);
      forget(s.key);
      if (s.key.endsWith("-media") && state.domains.media && !s.key.includes("-dev-")) forget(`domain:${state.domains.media}`);
    } else if (s.kind === "repo") {
      await deleteRepo(s.name, c);
      forget("repo");
    } else if (s.kind === "dev-branch") {
      const r = gh(["api", "-X", "DELETE", `repos/${state.owner}/${state.repo}/git/refs/heads/dev`]);
      if (r.status !== 0 && !/Reference does not exist|Not Found|422/.test(r.out)) throw new Error(`Deleting the dev branch failed:\n${r.out.slice(-1000)}`);
      c.ok("dev branch deleted");
    } else if (s.key === "local:dev") {
      for (const file of ["alasin.toml", "wrangler.toml"]) {
        const path = join(c.dir, file);
        if (existsSync(path)) writeFileSync(path, removeTables(readFileSync(path, "utf8"), "env.dev"));
      }
      for (const k of devKeys(state, items)) forget(k);
      state.environments = state.environments.filter((e) => e !== "dev");
      delete state.devMediaUrl;
      delete state.devSiteUrl;
      delete state.secondAuthor;
      c.save(state);
      c.ok("[env.dev] removed from the configuration; create-site.json updated");
    } else if (s.key === "local") {
      rmSync(c.dir, { recursive: true, force: true });
      c.ok(`${s.name} deleted`);
    }
  }
  if (mode === "dev") c.info(`The ${state.environments.join(", ")} environment stays as it was.`);
}
