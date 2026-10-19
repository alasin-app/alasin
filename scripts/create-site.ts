// SPDX-License-Identifier: MIT
//
// npm run create-site [-- --site <name>] [--dry-run] [--yes]
// npm run create-site -- --site <name> --reset-dev
// npm run create-site -- --site <name> --remove | --remove-dev [--dry-run]
//
// Creates a new site with its environments (#251): asks for the site
// repository, the Alasin name, the environments and production's domains,
// checks GitHub, Cloudflare and DNS for what already exists, and prints the
// plan. Anything that exists but wasn't made by this deployment gets a warning
// and needs the repository name typed to go on; it is only ever reused, never
// changed. Then, after a confirmation (--yes skips it), it creates what's new:
// the buckets (the dev media bucket with its public r2.dev URL, production's
// with its domain), and the private site repository from the skeleton, with
// main and a dev branch, cloned to deployments/<site>/site/.
//
// Answers and what was made are kept in deployments/<site>/create-site.json
// after each step, so a re-run (--site <name>) asks nothing already answered
// and continues where it stopped. Then the site Worker: created, given the
// site's domain, and connected to the repository with Workers Builds (needs a
// user API token in CLOUDFLARE_BUILDS_TOKEN); for dev, the sample content;
// and last Alasin itself: its alasin.toml and wrangler.toml in
// deployments/<site>/, then npm run setup and npm run deploy for each
// environment (setup creates the GitHub App in the browser).

import { spawnSync } from "node:child_process";
import { resolve as resolveDns } from "node:dns/promises";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
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
  type PlannedItem,
  planItems,
  planLines,
  previewUrl,
  r2DevUrl,
  type SiteState,
  siteItems,
  siteWorkerName,
  skeletonValuesFor,
} from "./lib/create-site";
import { accountId, cloudflareApi, deleteObject, listObjects, zoneFor } from "./lib/cloudflare-api";
import { creditsPage, jpegSize, missingVariants, type SampleFile, sampleUploads } from "./lib/sample-content";
import { attachDomain, type BuildToken, connectBuilds, createPlaceholderWorker } from "./lib/site-worker";
import { siteConfigFor } from "./lib/site-config";
import { removalLines, removalSteps, type RemoveMode } from "./lib/removal";
import { canDeleteRepos, DELETE_REPO_SCOPE, removeSite } from "./lib/site-removal";
import { fillPlaceholders, PLACEHOLDER_FILES, unfilled } from "./lib/skeleton";
import { parse as parseToml } from "smol-toml";
import { SITE_NAME } from "./lib/deployments";
import { swallowedOptions, swallowedOptionsMessage } from "./lib/npm-args";
import * as cf from "./setup/cloudflare";
import { ask, bold, closePrompt, confirm, dim, info, ok, red, step, warn } from "./setup/prompt";

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

function parse(argv: string[]): { site?: string; dryRun: boolean; yes: boolean; resetDev: boolean; remove?: RemoveMode } {
  const swallowed = swallowedOptions(process.env);
  if (swallowed.length) throw new Error(swallowedOptionsMessage("create-site", swallowed));
  let site: string | undefined;
  let dryRun = false;
  let yes = false;
  let resetDev = false;
  let remove: RemoveMode | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--dry-run") dryRun = true;
    else if (a === "--yes") yes = true;
    else if (a === "--reset-dev") resetDev = true;
    else if (a === "--remove") remove = "all";
    else if (a === "--remove-dev") remove = "dev";
    else if (a === "--site") site = argv[++i];
    else if (a.startsWith("--site=")) site = a.slice(7);
    else throw new Error(`Unexpected argument ${a}. Options: --site <name>, --dry-run, --yes, --reset-dev, --remove, --remove-dev.`);
  }
  if (site !== undefined && !SITE_NAME.test(site)) throw new Error(`--site must be a site repository name, got "${site ?? ""}"`);
  if (resetDev && !site) throw new Error("--reset-dev needs --site <name>: the site whose dev content to reset.");
  if (remove && !site) throw new Error("--remove and --remove-dev need --site <name>: the site to remove.");
  if (remove && resetDev) throw new Error("Give --reset-dev or a removal, not both.");
  return { site, dryRun, yes, resetDev, ...(remove ? { remove } : {}) };
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

  const title = previous?.title ?? (await ask("Site title", { default: repo! }));
  if (previous?.title) ok(`Site title: ${title}`);
  const language = previous?.language ?? (await ask("Site language (Hugo locale, e.g. en or fi)", { default: "en", validate: (v) => (/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(v) ? null : "a locale like en or fi") }));
  if (previous?.language) ok(`Site language: ${language}`);
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

  let secondAuthor = previous?.secondAuthor;
  if (environments.includes("dev") && !secondAuthor) {
    const login = await ask("Second author of the dev site's sample posts: a GitHub login (shows an avatar if they're a collaborator), or empty for a made-up one", {
      default: "",
      validate: (v) => (!v || /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(v) ? null : "a GitHub login, or empty"),
    });
    if (login) {
      const r = spawnSync("gh", ["api", `users/${login}`, "--jq", ".name // .login"], { encoding: "utf8" });
      secondAuthor = { login, name: r.status === 0 && r.stdout.trim() ? r.stdout.trim() : login };
    } else secondAuthor = { login: "sample-author", name: "Sample Author" };
  } else if (secondAuthor) ok(`Second sample author: ${secondAuthor.name} (@${secondAuthor.login})`);

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
  return {
    version: 1,
    owner: owner!,
    repo: repo!,
    title,
    language,
    alasinName,
    environments,
    jurisdiction,
    domains,
    created: previous?.created ?? [],
    ...(previous?.devMediaUrl ? { devMediaUrl: previous.devMediaUrl } : {}),
    ...(previous?.devSiteUrl ? { devSiteUrl: previous.devSiteUrl } : {}),
    ...(secondAuthor ? { secondAuthor } : {}),
  };
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
  // A configuration create-site wrote itself holds its own names, not an earlier deployment's.
  if (existsSync(join(repoRoot, local)) && !state.created.includes("config")) {
    try {
      Object.assign(known, namesFromAlasinWrangler(parseToml(readFileSync(join(repoRoot, local), "utf8")) as Record<string, unknown>, local));
    } catch {
      warn(`${local} can't be read: its names aren't used.`);
    }
  }
  const repository = `${state.owner}/${state.repo}`;
  // A repository this deployment made holds the skeleton's own Wrangler file, not an earlier deployment's.
  if (state.created.includes("repo")) return known;
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

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

/** Runs a command where the user sees its output; throws if it fails. */
function runVisible(cmd: string, args: string[], cwd: string) {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (r.error || r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 3).join(" ")} … failed`);
}

/** wrangler, quietly; its output if it fails. */
function wrangler(args: string[]): string {
  const r = capture("wrangler", args);
  if (r.code !== 0) throw new Error(`wrangler ${args.slice(0, 4).join(" ")} failed:\n${(r.stderr || r.stdout).slice(-2000)}`);
  return r.stdout + r.stderr;
}

/** The site repository: the skeleton filled in, committed to main, a dev branch, cloned in deployments/<site>/site/. */
function createRepository(state: SiteState, items: Item[]) {
  const dir = join(repoRoot, DEPLOYMENTS, state.repo, "site");
  const shown = relative(repoRoot, dir);
  if (existsSync(dir) && readdirSync(dir).length) throw new Error(`${shown}/ isn't empty: move it away first (nothing was created on GitHub).`);
  cpSync(join(repoRoot, "templates", "site"), dir, { recursive: true });
  const values = skeletonValuesFor(state, items);
  for (const file of PLACEHOLDER_FILES) writeFileSync(join(dir, file), fillPlaceholders(readFileSync(join(dir, file), "utf8"), values));
  for (const path of files(dir)) {
    const left = unfilled(readFileSync(path, "utf8"));
    if (left.length) throw new Error(`${relative(dir, path)} still has ${left.join(", ")}`);
  }
  runVisible("git", ["init", "--quiet", "-b", "main"], dir);
  runVisible("git", ["add", "-A"], dir);
  runVisible("git", ["commit", "--quiet", "-m", "Create the site from Alasin's skeleton"], dir);
  runVisible("gh", ["repo", "create", `${state.owner}/${state.repo}`, "--private", "--source", dir, "--remote", "origin", "--push", "--description", "A Hugo site written with Alasin"], dir);
  runVisible("git", ["push", "--quiet", "origin", "main:refs/heads/dev"], dir);
  runVisible("git", ["fetch", "--quiet", "origin"], dir);
  runVisible("git", ["branch", "--quiet", "--track", "dev", "origin/dev"], dir);
  ok(`${state.owner}/${state.repo}: created (private), with main and dev; cloned in ${shown}/`);
}

/** The build token Workers Builds deploys with: CLOUDFLARE_BUILD_TOKEN_NAME, or asked from the list. */
async function chooseBuildToken(tokens: BuildToken[]): Promise<BuildToken> {
  const name = (t: BuildToken) => t.build_token_name || t.build_token_uuid;
  const wanted = process.env.CLOUDFLARE_BUILD_TOKEN_NAME;
  if (wanted) {
    const found = tokens.find((t) => name(t) === wanted);
    if (!found) throw new Error(`No build token named "${wanted}". There are: ${tokens.map(name).join(", ")}`);
    return found;
  }
  step("Build token");
  info("The account has several Workers Builds tokens (the tokens builds deploy with). Some may have been deleted or rolled:");
  info("check under Workers & Pages → any connected Worker → Settings → Builds → API token which ones still work.");
  tokens.forEach((t, i) => info(`  ${i + 1}. ${name(t)}`));
  info("  0. None of these works");
  const n = await ask("Which one", { validate: (v) => (/^\d+$/.test(v) && +v <= tokens.length ? null : `a number from 0 to ${tokens.length}`) });
  if (n === "0") {
    throw new Error(
      [
        "Make a new build token in the dashboard, then run create-site again and choose it:",
        "  Workers & Pages → the site Worker → Settings → Builds → API token → Create new token → Save.",
        "  (Or set CLOUDFLARE_BUILD_TOKEN_NAME to its name to choose it without asking.)",
        "The site Worker and everything before it are kept; the next run continues with Workers Builds.",
      ].join("\n"),
    );
  }
  return tokens[+n - 1]!;
}

/** Runs one of Alasin's scripts (setup, deploy) in this terminal, as if started on its own. */
function runScript(script: string, args: string[]) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^npm_(config|package|lifecycle)_/i.test(k)));
  const tsx = join(repoRoot, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
  const r = spawnSync(tsx, [join(repoRoot, script), ...args], { cwd: repoRoot, stdio: "inherit", env, shell: process.platform === "win32" });
  if (r.error || r.status !== 0) throw new Error(`${script} ${args.join(" ")} didn't finish. Run create-site again to continue from there.`);
}

/**
 * Alasin itself: this site's alasin.toml and wrangler.toml (production and
 * [env.dev], or dev alone), then npm run setup (GitHub App in the browser, KV,
 * secrets, the app's domain) and npm run deploy for each environment.
 */
async function setUpAlasin(state: SiteState, plan: PlannedItem[], made: (key: string) => void) {
  step("Alasin");
  const dir = join(repoRoot, DEPLOYMENTS, state.repo);
  const shown = relative(repoRoot, dir);
  const prod = state.environments.includes("production");
  const dev = state.environments.includes("dev");
  if (!state.created.includes("config")) {
    if (existsSync(join(dir, "alasin.toml")) || existsSync(join(dir, "wrangler.toml"))) {
      warn(`${shown}/ already has an Alasin configuration create-site didn't write: it's left as it is. Set it up with npm run setup -- --site ${state.repo}.`);
      return;
    }
    let devAppUrl: string | undefined;
    if (dev) {
      const { subdomain } = await cloudflareApi<{ subdomain: string }>(`/accounts/${accountId()}/workers/subdomain`);
      devAppUrl = `https://${plan.find((p) => p.slot === "alasin:dev")!.name}.${subdomain}.workers.dev`;
    }
    const { alasin, wrangler } = siteConfigFor(state, plan, {
      alasinExample: readFileSync(join(repoRoot, "alasin.example.toml"), "utf8"),
      wranglerExample: readFileSync(join(repoRoot, "wrangler.example.toml"), "utf8"),
      devAppUrl,
    });
    writeFileSync(join(dir, "alasin.toml"), alasin);
    writeFileSync(join(dir, "wrangler.toml"), wrangler);
    made("config");
    ok(`${shown}/alasin.toml and wrangler.toml written${prod && dev ? " (production and [env.dev])" : ""}`);
  }

  // The base configuration is production, or dev when there's only dev; with both, dev is [env.dev].
  const deployments: { env?: string; slot: PlannedItem["slot"] }[] = prod
    ? [{ slot: "alasin:production" }, ...(dev ? [{ env: "dev", slot: "alasin:dev" as const }] : [])]
    : [{ slot: "alasin:dev" }];
  const todo = deployments.filter((d) => !state.created.includes(plan.find((p) => p.slot === d.slot)!.key));
  if (!todo.length) {
    ok("Set up and deployed");
    return;
  }
  // setup and deploy ask their own questions in this terminal.
  closePrompt();
  for (const [i, d] of todo.entries()) {
    const worker = plan.find((p) => p.slot === d.slot)!;
    // setup already creates the Worker (with its secrets): it's this deployment's from here on.
    made(`pending:${worker.key}`);
    const envArgs = d.env ? ["--env", d.env] : [];
    const which = d.slot === "alasin:dev" ? "dev" : "production";
    step(`Alasin, ${which} (${i + 1} of ${todo.length}): ${worker.name}`);
    info(`npm run setup -- --site ${state.repo}${d.env ? ` --env ${d.env}` : ""}, then npm run deploy: setup asks its own questions here,`);
    info(`and creates the ${which} GitHub App in your browser, the KV namespace and the secrets.`);
    runScript("scripts/setup/index.ts", ["--site", state.repo, ...envArgs]);
    runScript("scripts/alasin.ts", ["deploy", "--site", state.repo, ...envArgs]);
    made(worker.key);
    const appDomain = !d.env && prod ? plan.find((p) => p.slot === "domain:app") : undefined;
    if (appDomain) made(appDomain.key);
    ok(`${worker.name}: deployed`);
  }
}

const SAMPLE = join(repoRoot, "templates", "sample");

/** The dev site's sample content, filled in: the person running create-site and the second author. */
function sampleFiles(state: SiteState): SampleFile[] {
  const me = spawnSync("gh", ["api", "user", "--jq", "[.login, (.name // .login)] | @tsv"], { encoding: "utf8" });
  if (me.status !== 0) throw new Error("GitHub: who you are can't be read (gh auth login)");
  const [login, name] = me.stdout.trim().split("\t");
  const second = state.secondAuthor ?? { login: "sample-author", name: "Sample Author" };
  const values = { SITE_TITLE: state.title || state.repo, AUTHOR_NAME: name!, AUTHOR_ID: login!, SECOND_AUTHOR_NAME: second.name, SECOND_AUTHOR_ID: second.login };
  const root = join(SAMPLE, "repo");
  return [
    ...files(root).map((path) => ({ path: relative(root, path), text: fillPlaceholders(readFileSync(path, "utf8"), values) })),
    creditsPage(readFileSync(join(SAMPLE, "CREDITS.md"), "utf8")),
  ];
}

/** The sample photos to upload for these files, each with its ready-made sizes. */
function samplePhotos(samples: SampleFile[]) {
  const images = readdirSync(join(SAMPLE, "images")).filter((f) => f.endsWith(".jpg"));
  const uploads = sampleUploads(samples, {
    contentPrefix: "/img/",
    widths: [480, 960, 1600],
    variantName: "{name}-{width}.{ext}",
    variantFormat: "webp",
    images,
    width: (image) => jpegSize(new Uint8Array(readFileSync(join(SAMPLE, "images", image))))?.width ?? 0,
  });
  const missing = missingVariants(uploads, readdirSync(join(SAMPLE, "images", "variants")));
  if (missing.length) throw new Error(`Sample photo sizes missing in templates/sample/images/variants/: ${missing.join(", ")}`);
  return uploads;
}

/** The dev buckets: media and drafts, with their jurisdictions. */
function devBuckets(state: SiteState, plan: PlannedItem[]) {
  const b = (slot: PlannedItem["slot"]) => {
    const p = plan.find((x) => x.slot === slot)!;
    return { name: p.name, jurisdiction: (p.jurisdiction ?? state.jurisdiction) || undefined };
  };
  return { media: b("media:dev"), drafts: b("drafts:dev") };
}

/** Uploads the sample photos and their sizes to the dev buckets. */
function uploadSamplePhotos(state: SiteState, plan: PlannedItem[], uploads: ReturnType<typeof samplePhotos>): number {
  const bucket = devBuckets(state, plan);
  let n = 0;
  for (const u of uploads) {
    const target = bucket[u.bucket];
    const put = (key: string, file: string, type: string) =>
      wrangler([
        "r2", "object", "put", `${target.name}/${key}`, "--file", file, "--content-type", type, "--remote",
        ...(u.bucket === "media" ? ["--cache-control", "public, max-age=604800"] : []),
        ...(target.jurisdiction ? ["-J", target.jurisdiction] : []),
      ]);
    put(u.key, join(SAMPLE, "images", u.image), "image/jpeg");
    for (const v of u.variants) put(v.key, join(SAMPLE, "images", "variants", v.file), "image/webp");
    n += 1 + u.variants.length;
    info(`  ${u.bucket}: ${u.key} (+${u.variants.length} sizes)`);
  }
  return n;
}

/** Commits the sample content to the dev branch and uploads its photos (with their sizes) to the dev buckets. */
function addSampleContent(state: SiteState, plan: PlannedItem[], made: (key: string) => void) {
  step("Dev site's sample content");
  const samples = sampleFiles(state);
  const uploads = samplePhotos(samples);

  if (!state.created.includes("sample:content")) {
    const dir = join(repoRoot, DEPLOYMENTS, state.repo, "site");
    if (!existsSync(join(dir, ".git"))) throw new Error(`${relative(repoRoot, dir)}/ isn't a clone of the site repository`);
    runVisible("git", ["switch", "--quiet", "dev"], dir);
    runVisible("git", ["pull", "--quiet", "--ff-only"], dir);
    for (const f of samples) {
      mkdirSync(join(dir, f.path, ".."), { recursive: true });
      writeFileSync(join(dir, f.path), f.text);
    }
    runVisible("git", ["add", "-A"], dir);
    runVisible("git", ["commit", "--quiet", "-m", "Add the dev site's sample content"], dir);
    runVisible("git", ["push", "--quiet", "origin", "dev"], dir);
    runVisible("git", ["switch", "--quiet", "main"], dir);
    made("sample:content");
    ok(`${samples.length} files committed to the dev branch: home page, pages, posts, drafts, archive, Bin, categories, credits`);
  } else ok("Committed to the dev branch earlier");

  if (!state.created.includes("sample:photos")) {
    const n = uploadSamplePhotos(state, plan, uploads);
    made("sample:photos");
    ok(`${n} photo files uploaded to the dev buckets`);
  } else ok("Photos uploaded to the dev buckets earlier");
}

/**
 * Puts the dev site back to the sample content: the dev branch gets main's
 * files plus the sample content (one new commit), and the dev buckets are
 * emptied and get the sample photos again. Only for a site whose sample content
 * create-site added; production, the Workers, buckets and repository stay.
 */
async function resetDev(state: SiteState, plan: PlannedItem[]) {
  if (!state.environments.includes("dev") || !state.created.includes("sample:content") || !state.created.includes("repo")) {
    throw new Error("Only a dev site create-site made, with its sample content, can be reset.");
  }
  const dir = join(repoRoot, DEPLOYMENTS, state.repo, "site");
  if (!existsSync(join(dir, ".git"))) throw new Error(`${relative(repoRoot, dir)}/ isn't a clone of the site repository`);
  const dirty = spawnSync("git", ["status", "--porcelain"], { cwd: dir, encoding: "utf8" });
  if (dirty.status !== 0 || dirty.stdout.trim()) throw new Error(`${relative(repoRoot, dir)}/ has uncommitted changes: commit or discard them first.`);
  const buckets = devBuckets(state, plan);

  step("Reset the dev site");
  info("This replaces everything on the dev site with the sample content:");
  info(`  - the dev branch of ${state.owner}/${state.repo}: main's files plus the sample content, in one new commit`);
  info("    (posts, pages, drafts, archive and Bin changes made in the dev app are undone; history is kept)");
  info(`  - the buckets ${buckets.media.name} and ${buckets.drafts.name}: emptied, then the sample photos again`);
  info("Production, the Workers, the buckets themselves and the repository are not touched.");
  const typed = await ask(`To reset, type the repository name (${state.owner}/${state.repo}); anything else stops`, { default: "stop", validate: () => null });
  if (typed !== `${state.owner}/${state.repo}`) {
    info("Stopped. Nothing was changed.");
    return;
  }

  const samples = sampleFiles(state);
  const uploads = samplePhotos(samples);
  runVisible("git", ["fetch", "--quiet", "origin"], dir);
  runVisible("git", ["switch", "--quiet", "dev"], dir);
  runVisible("git", ["pull", "--quiet", "--ff-only"], dir);
  // main's files, then the sample content over them.
  runVisible("git", ["read-tree", "-u", "--reset", "origin/main"], dir);
  for (const f of samples) {
    mkdirSync(join(dir, f.path, ".."), { recursive: true });
    writeFileSync(join(dir, f.path), f.text);
  }
  runVisible("git", ["add", "-A"], dir);
  if (spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: dir }).status === 0) ok("The dev branch already has exactly the sample content");
  else {
    runVisible("git", ["commit", "--quiet", "-m", "Reset the dev site to the sample content"], dir);
    runVisible("git", ["push", "--quiet", "origin", "dev"], dir);
    ok("Dev branch reset (a new build of the dev site starts)");
  }
  runVisible("git", ["switch", "--quiet", "main"], dir);

  for (const b of [buckets.media, buckets.drafts]) {
    const keys = await listObjects(b.name, b.jurisdiction);
    for (const key of keys) await deleteObject(b.name, key, b.jurisdiction);
    ok(`${b.name}: emptied (${keys.length} objects)`);
  }
  ok(`${uploadSamplePhotos(state, plan, uploads)} sample photo files uploaded again`);
  info("Reload the dev app: its lists are read again from the reset branch.");
}

async function create(state: SiteState, plan: PlannedItem[]) {
  const made = (key: string) => {
    if (!state.created.includes(key)) state.created.push(key);
    writeState(state);
  };
  const slot = (s: PlannedItem["slot"]) => plan.find((p) => p.slot === s);
  const mine = (p: PlannedItem | undefined) => !!p && (p.status === "new" || p.status === "ours" || state.created.includes(p.key));
  const j = (p: PlannedItem) => (p.jurisdiction ?? state.jurisdiction) || undefined;
  const jArgs = (p: PlannedItem) => (j(p) ? ["-J", j(p)!] : []);

  step("Buckets");
  const newBuckets = plan.filter((x) => x.kind === "bucket" && x.status === "new" && !state.created.includes(x.key));
  if (!newBuckets.length) ok("All there");
  for (const p of newBuckets) {
    const r = cf.createBucket(p.name, j(p));
    if (!r.ok) throw new Error(`Couldn't create bucket ${p.name}:\n${r.output.slice(-2000)}`);
    made(p.key);
    ok(`${p.name}: created`);
  }
  const devMedia = slot("media:dev");
  if (devMedia && mine(devMedia) && !state.devMediaUrl) {
    wrangler(["r2", "bucket", "dev-url", "enable", devMedia.name, ...jArgs(devMedia), "-y"]);
    const url = r2DevUrl(wrangler(["r2", "bucket", "dev-url", "get", devMedia.name, ...jArgs(devMedia)]));
    if (!url) throw new Error(`${devMedia.name}: its r2.dev URL couldn't be read`);
    state.devMediaUrl = url;
    writeState(state);
    ok(`${devMedia.name}: public at ${url}`);
  }
  const mediaDomain = slot("domain:media");
  const prodMedia = slot("media:production");
  if (mediaDomain?.status === "new" && !state.created.includes(mediaDomain.key) && prodMedia && mine(prodMedia)) {
    const zone = await zoneFor(mediaDomain.name);
    if (!zone) throw new Error(`${mediaDomain.name}: none of its zones is in this Cloudflare account`);
    wrangler(["r2", "bucket", "domain", "add", prodMedia.name, "--domain", mediaDomain.name, "--zone-id", zone.id, ...jArgs(prodMedia), "-y"]);
    made(mediaDomain.key);
    ok(`${prodMedia.name}: served at https://${mediaDomain.name}/`);
  }

  step("Site repository");
  const repo = slot("repo")!;
  if (repo.status === "new" && !state.created.includes(repo.key)) {
    createRepository(state, plan);
    made(repo.key);
  } else ok(`${repo.name}: ${repo.status === "not-ours" ? "exists, not changed" : "already there"}`);

  step("Site Worker");
  const worker = slot("site-worker")!;
  if (worker.status === "new" && !state.created.includes(worker.key)) {
    createPlaceholderWorker(worker.name);
    made(worker.key);
    ok(`${worker.name}: created (a placeholder page until its first build)`);
  }
  const siteDomain = slot("domain:site");
  if (siteDomain?.status === "new" && !state.created.includes(siteDomain.key) && mine(worker)) {
    await attachDomain(worker.name, siteDomain.name);
    made(siteDomain.key);
    ok(`${worker.name}: served at https://${siteDomain.name}/`);
  }
  const buildsKey = `builds:${worker.name}`;
  if (mine(worker) && mine(repo) && !state.created.includes(buildsKey)) {
    const builds = await connectBuilds(worker.name, repo.name, chooseBuildToken);
    made(buildsKey);
    ok(`${repo.name} connected with Workers Builds: main → production, other branches → previews`);
    for (const b of builds) info(`  build of ${b.branch} started (${b.build})`);
    info("  Follow them in the dashboard: Workers & Pages → the site Worker → Deployments / Builds.");
    info("  If they fail right after Initializing with \"The build token … has been deleted or rolled\", choose or create another");
    info("  under Settings → Builds → API token and retry the builds there.");
  } else if (state.created.includes(buildsKey)) ok(`${worker.name}: connected with Workers Builds (to connect again, e.g. with another build token, remove "${buildsKey}" from create-site.json)`);
  if (state.environments.includes("dev") && state.created.includes(buildsKey) && !state.devSiteUrl) {
    const { subdomain } = await cloudflareApi<{ subdomain: string }>(`/accounts/${accountId()}/workers/subdomain`);
    state.devSiteUrl = previewUrl(worker.name, "dev", subdomain);
    writeState(state);
  }
  if (state.domains.site && state.environments.includes("production")) info(`  Production site: https://${state.domains.site}/`);
  if (state.devSiteUrl) info(`  Dev site (the dev branch's preview): ${state.devSiteUrl}`);

  if (state.environments.includes("dev") && mine(repo) && state.devMediaUrl && slot("media:dev") && mine(slot("media:dev"))) {
    addSampleContent(state, plan, made);
  }

  if (mine(repo) && (!state.environments.includes("dev") || state.devSiteUrl)) await setUpAlasin(state, plan, made);
  else warn("Alasin itself is set up once the site Worker is connected with Workers Builds (the dev site's address is needed).");
}

async function main() {
  const args = parse(process.argv.slice(2));
  console.log(bold("Alasin create-site") + dim(args.dryRun ? " (dry run)" : ""));
  const previous = args.site ? readState(args.site) : null;
  if (args.resetDev && !previous) throw new Error(`No ${DEPLOYMENTS}/${args.site}/create-site.json: only a site create-site made can be reset.`);
  if (args.remove && !previous) throw new Error(`No ${DEPLOYMENTS}/${args.site}/create-site.json: only a site create-site made can be removed, and only what it made.`);
  if (args.remove === "dev" && !previous!.environments.includes("dev")) throw new Error("This site has no dev environment.");
  if (args.site && !previous) info(`No ${DEPLOYMENTS}/${args.site}/create-site.json yet: starting a new site.`);
  const state = await askAnswers(previous);
  if (!args.site) {
    const earlier = readState(state.repo);
    if (earlier) state.created = earlier.created;
  }

  step("Checking what exists");
  const items = siteItems(state, knownNames(state));
  const plan = planItems(items, await check(items, state.jurisdiction), state.created);

  if (args.resetDev) {
    await resetDev(state, plan);
    return;
  }
  if (args.remove) {
    const steps = removalSteps(state, items, args.remove);
    step(args.remove === "dev" ? "Remove the dev environment" : "Remove the site");
    for (const line of removalLines(steps)) info(line);
    info("Only what this site's create-site made is removed; the rest is listed as kept.");
    // Checked first, so nothing is removed before a step that couldn't be done (and gh's login never runs inside this).
    if (steps.some((s) => s.kind === "repo" && s.remove) && !canDeleteRepos()) {
      warn(`gh may not delete repositories yet. Run this first (it opens GitHub in the browser), then run create-site again:`);
      info(`  ${DELETE_REPO_SCOPE}`);
      return;
    }
    if (args.dryRun) return;
    console.log(`  ${red("This can't be undone: the buckets' photos" + (args.remove === "dev" ? ", the dev branch" : " and the repository with its history") + " are deleted.")}`);
    const typed = await ask(`To remove, type the repository name (${state.owner}/${state.repo}); anything else stops`, { default: "stop", validate: () => null });
    if (typed !== `${state.owner}/${state.repo}`) {
      info("Stopped. Nothing was removed.");
      return;
    }
    await removeSite(steps, args.remove, items, {
      state,
      plan,
      dir: join(repoRoot, DEPLOYMENTS, state.repo),
      save: writeState,
      ask: (q) => ask(q, { default: "", validate: () => null }),
      info,
      ok,
      warn,
      step,
    });
    return;
  }

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

  const todo = plan.filter((p) => p.status === "new" && !state.created.includes(p.key)).length;
  const devPending = state.environments.includes("dev") && !(state.devMediaUrl && state.created.includes("sample:content") && state.created.includes("sample:photos"));
  // An Alasin deployment that was started but not finished.
  const alasinPending = plan.some(
    (p) => (p.slot === "alasin:production" || p.slot === "alasin:dev") && state.created.includes(`pending:${p.key}`) && !state.created.includes(p.key),
  );
  if (!todo && !devPending && !alasinPending) {
    info("Nothing new to create.");
    return;
  }
  const what = [todo ? `the new items (${todo})` : "", devPending ? "the dev site's sample content" : "", alasinPending ? "the unfinished Alasin deployment" : ""]
    .filter(Boolean)
    .join(" and ");
  if (!args.yes && !(await confirm(`Create ${what} now?`, false))) {
    info("Stopped before creating anything.");
    return;
  }
  await create(state, plan);
}

main()
  .catch((err: unknown) => {
    console.error(red(err instanceof Error ? err.message : String(err)));
    process.exitCode = 1;
  })
  .finally(closePrompt);
