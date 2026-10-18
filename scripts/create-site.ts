// SPDX-License-Identifier: MIT
//
// npm run create-site [-- --site <name>] [--dry-run]
//
// Plans a new site with its environments (#251): asks for the site repository,
// the Alasin name, the environments and production's domains, checks GitHub,
// Cloudflare and DNS for what already exists, and prints what would be
// created. Anything that exists but wasn't made by this deployment gets a
// warning and needs the repository name typed to go on. The answers are kept
// in deployments/<site>/create-site.json, so a re-run (--site <name>) asks
// nothing already answered.
//
// This version plans only: creating the items comes in later versions.

import { spawnSync } from "node:child_process";
import { resolve as resolveDns } from "node:dns/promises";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEPLOYMENTS, repoRoot } from "./lib/args";
import { capture } from "./lib/proc";
import {
  alreadyDeployedWarning,
  type Environment,
  type Existing,
  hostnameProblem,
  type Item,
  type KnownNames,
  namesFromAlasinWrangler,
  parseRepository,
  planItems,
  planLines,
  type SiteState,
  siteItems,
  siteWorkerName,
} from "./lib/create-site";
import { parse as parseToml } from "smol-toml";
import { SITE_NAME } from "./lib/deployments";
import { swallowedOptions, swallowedOptionsMessage } from "./lib/npm-args";
import * as cf from "./setup/cloudflare";
import { ask, bold, closePrompt, dim, info, ok, red, step, warn } from "./setup/prompt";

const statePath = (repo: string) => join(repoRoot, DEPLOYMENTS, repo, "create-site.json");

function readState(repo: string): SiteState | null {
  const path = statePath(repo);
  if (!existsSync(path)) return null;
  const state = JSON.parse(readFileSync(path, "utf8")) as SiteState;
  if (state.version !== 1) throw new Error(`${path}: unknown version ${String(state.version)}`);
  return state;
}

function writeState(state: SiteState) {
  const path = statePath(state.repo);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
}

function parse(argv: string[]): { site?: string; dryRun: boolean } {
  const swallowed = swallowedOptions(process.env);
  if (swallowed.length) throw new Error(swallowedOptionsMessage("create-site", swallowed));
  let site: string | undefined;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--dry-run") dryRun = true;
    else if (a === "--site") site = argv[++i];
    else if (a.startsWith("--site=")) site = a.slice(7);
    else throw new Error(`Unexpected argument ${a}. Options: --site <name>, --dry-run.`);
  }
  if (site !== undefined && !SITE_NAME.test(site)) throw new Error(`--site must be a site repository name, got "${site ?? ""}"`);
  return { site, dryRun };
}

async function askAnswers(previous: SiteState | null): Promise<SiteState> {
  step("The site");
  let owner = previous?.owner;
  let repo = previous?.repo;
  if (!owner || !repo) {
    const answer = await ask("Site repository on GitHub (owner/name; created private)", {
      validate: (v) => {
        const r = parseRepository(v);
        return typeof r === "string" ? r : null;
      },
    });
    ({ owner, repo } = parseRepository(answer) as { owner: string; repo: string });
  } else ok(`Site repository: ${owner}/${repo}`);

  const alasinName = previous?.alasinName ?? (await ask("Alasin name (base name of its Cloudflare Worker)", { default: "alasin" }));
  if (previous?.alasinName) ok(`Alasin name: ${alasinName}`);

  let environments = previous?.environments;
  if (!environments?.length) {
    const answer = await ask("Environments: production, dev or both", {
      default: "both",
      validate: (v) => (["production", "dev", "both"].includes(v) ? null : "production, dev or both"),
    });
    environments = answer === "both" ? ["production", "dev"] : [answer as Environment];
  } else ok(`Environments: ${environments.join(", ")}`);

  let jurisdiction = previous?.jurisdiction;
  if (jurisdiction === undefined) {
    const answer = await ask("R2 jurisdiction for new buckets (none, eu or fedramp)", {
      default: "none",
      validate: (v) => (["none", "eu", "fedramp"].includes(v) ? null : "none, eu or fedramp"),
    });
    jurisdiction = answer === "none" ? "" : answer;
  }

  const domains = { ...previous?.domains };
  if (environments.includes("production")) {
    for (const [key, question] of [
      ["site", "Production site's domain (e.g. www.example.com)"],
      ["app", "Production Alasin's domain (e.g. alasin.example.com)"],
      ["media", "Production media domain (e.g. media.example.com)"],
    ] as const) {
      if (domains[key]) ok(`${question.replace(/ \(e\.g\..*\)$/, "")}: ${domains[key]}`);
      else domains[key] = (await ask(question, { validate: hostnameProblem })).toLowerCase();
    }
  }
  return { version: 1, owner: owner!, repo: repo!, alasinName, environments, jurisdiction, domains, created: previous?.created ?? [] };
}

/** True / false, or null if GitHub couldn't be asked. */
function repoExists(name: string): boolean | null {
  const r = spawnSync("gh", ["api", `repos/${name}`, "--jq", ".id"], { encoding: "utf8" });
  if (r.error) return null;
  if (r.status === 0) return true;
  return /HTTP 404|Not Found/.test(r.stderr) ? false : null;
}

function workerExists(name: string): boolean | null {
  const r = capture("wrangler", ["deployments", "list", "--name", name, "--json"]);
  if (r.code === 0) return true;
  return /does not exist|\b10007\b|not found/i.test(r.stderr + r.stdout) ? false : null;
}

async function domainInUse(host: string): Promise<boolean | null> {
  try {
    await resolveDns(host);
    return true;
  } catch (err) {
    const code = (err as { code?: string }).code;
    return code === "ENOTFOUND" || code === "ENODATA" ? false : null;
  }
}

/** A file of the repository's default branch through gh, or null. */
function repoFile(repository: string, path: string): string | null {
  const r = spawnSync("gh", ["api", `repos/${repository}/contents/${path}`, "--jq", ".content"], { encoding: "utf8" });
  if (r.error || r.status !== 0 || !r.stdout.trim()) return null;
  return Buffer.from(r.stdout.replace(/\s/g, ""), "base64").toString("utf8");
}

/**
 * Names this site's existing deployment already uses: the Alasin Workers and
 * buckets in deployments/<repo>/wrangler.toml, and the site Worker in the site
 * repository's own Wrangler file.
 */
function knownNames(state: SiteState): KnownNames {
  const known: KnownNames = {};
  const local = join(DEPLOYMENTS, state.repo, "wrangler.toml");
  if (existsSync(join(repoRoot, local))) {
    try {
      Object.assign(known, namesFromAlasinWrangler(parseToml(readFileSync(join(repoRoot, local), "utf8")) as Record<string, unknown>, local));
    } catch {
      warn(`${local} can't be read: its names aren't used.`);
    }
  }
  const repository = `${state.owner}/${state.repo}`;
  for (const file of ["wrangler.jsonc", "wrangler.json", "wrangler.toml"]) {
    const text = repoFile(repository, file);
    if (text === null) continue;
    const name = siteWorkerName(file, text);
    if (name) known["site-worker"] = { name, source: `${repository}/${file}` };
    break;
  }
  return known;
}

async function check(items: Item[], jurisdiction: string): Promise<Existing> {
  const existing: Existing = new Map();
  const cloudflare = cf.whoami().loggedIn;
  if (!cloudflare) warn("Not logged in to Cloudflare (npx wrangler login): buckets and Workers can't be checked.");
  for (const item of items) {
    if (item.kind === "repo") existing.set(item.key, repoExists(item.name));
    else if (item.kind === "bucket") existing.set(item.key, cloudflare ? cf.bucketExists(item.name, (item.jurisdiction ?? jurisdiction) || undefined) : null);
    else if (item.kind === "worker") existing.set(item.key, cloudflare ? workerExists(item.name) : null);
    else existing.set(item.key, await domainInUse(item.name));
  }
  if (items.some((i) => i.kind === "repo" && existing.get(i.key) === null)) warn("GitHub couldn't be asked (gh auth login): the repository can't be checked.");
  return existing;
}

async function main() {
  const args = parse(process.argv.slice(2));
  console.log(bold("Alasin create-site") + dim(args.dryRun ? " (dry run)" : ""));
  const previous = args.site ? readState(args.site) : null;
  if (args.site && !previous) info(`No ${DEPLOYMENTS}/${args.site}/create-site.json yet: starting a new site.`);
  const state = await askAnswers(previous);
  if (!args.site) {
    const earlier = readState(state.repo);
    if (earlier) state.created = earlier.created;
  }

  step("Checking what exists");
  const items = siteItems(state, knownNames(state));
  const plan = planItems(items, await check(items, state.jurisdiction), state.created);

  step("Plan");
  for (const line of planLines(plan)) info(line);
  const warning = alreadyDeployedWarning(plan);
  if (warning) {
    console.log();
    for (const line of warning.split("\n")) console.log(`  ${red(line)}`);
  }
  if (args.dryRun) return;

  if (warning) {
    const typed = await ask(`To go on anyway, type the repository name (${state.owner}/${state.repo}); anything else stops`, { default: "stop", validate: () => null });
    if (typed !== `${state.owner}/${state.repo}`) {
      info("Stopped. Nothing was changed.");
      return;
    }
  }
  writeState(state);
  ok(`Answers saved in ${DEPLOYMENTS}/${state.repo}/create-site.json (run again with --site ${state.repo}).`);
  info("This version only plans: creating the repository, buckets and Workers comes in a later version.");
}

main()
  .catch((err: unknown) => {
    console.error(red(err instanceof Error ? err.message : String(err)));
    process.exitCode = 1;
  })
  .finally(closePrompt);
