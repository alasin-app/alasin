// SPDX-License-Identifier: MIT
//
// npm run setup [-- --env <name>] [--site <name> | --config <alasin.toml>] [--wrangler-config <wrangler.toml>] [--rotate-keys] [--rotate-github] [--add-site <id>]
//
// Interactive and safe to re-run: every step checks the current state first
// and only asks for, creates or changes what is missing. Re-running for one
// environment never changes another.
//
// Sites (#325): with a sites/ folder next to alasin.toml, the deployment
// serves several sites, and each one's own values go to sites/<id>.toml
// (scripts/lib/site-files.ts). --add-site <id> adds one: a deployment with
// one site is first split into alasin.toml and sites/<id of that site>.toml,
// and its buckets are named for it in wrangler.toml.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { parse } from "smol-toml";
import { ConfigError, deepMerge, selectEnvironment } from "../../src/shared/config/schema";
import { deploymentLine, parseArgs, repoRoot } from "../lib/args";
import { displayPath, loadDeployment, sitesDir } from "../lib/config";
import { SINGLE_SITE_ID, siteBindings, siteIdProblem } from "../../src/shared/config/deployment";
import { isSiteValue, renameBucketBindings, siteTemplate, splitSiteConfig, suggestSiteId } from "../lib/site-files";
import { appendSection, setValue, type TomlValue } from "../lib/toml-edit";
import { normalizeUrl, urlProblem } from "../lib/urls";
import { poll } from "../lib/poll";
import { migrateAlasinToml, plainComments } from "../lib/migrate";
import { today } from "../../src/shared/housekeeping";
import { checkBindings, generateWranglerConfig, REQUIRED_SECRETS } from "../lib/wrangler-config";
import { envWranglerSection } from "../lib/wrangler-env";
import * as cf from "./cloudflare";
import * as gh from "./github";
import { ask, bold, closePrompt, confirm, dim, info, ok, red, step, warn } from "./prompt";

type Table = Record<string, unknown>;

/** Example values from the *.example.toml files: treated as "not set yet". */
const PLACEHOLDERS = new Set<unknown>([
  "https://alasin.example.com",
  "https://www.example.com",
  "octocat",
  "my-hugo-site",
  123456,
  "Iv23liAbCdEfGhIjKlMn",
  12345678,
  "https://media.example.com/",
  "example-media",
  "example-media-drafts",
  "00000000000000000000000000000000",
]);
const isUnset = (v: unknown) => v === undefined || v === "" || PLACEHOLDERS.has(v);

// Pages of the documentation (wiki/), named in messages.
const BEFORE = "Before You Start in the wiki";

const args = (() => {
  try {
    return parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
})();
const env = args.env;
const envLabel = env ? ` [env.${env}]` : "";

function readText(path: string) {
  return readFileSync(path, "utf8");
}

function get(obj: Table, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Table)[k] : undefined), obj);
}

// ── alasin.toml editing ──────────────────────────────────────────────────────

let alasinText = "";
function alasinRaw(): Table {
  return parse(alasinText) as Table;
}

/** The site the steps work on: with sites/, its file; with one site, alasin.toml itself (id null). */
interface SiteTarget {
  id: string | null;
  path: string;
  text: string;
  media: string;
  drafts: string;
}
let site: SiteTarget = { id: null, path: "", text: "", ...siteBindings(SINGLE_SITE_ID, false) };

function useSite(id: string | null) {
  site = id
    ? { id, path: join(sitesDir(args.configPath), `${id}.toml`), text: readText(join(sitesDir(args.configPath), `${id}.toml`)), ...siteBindings(id, true) }
    : { id: null, path: args.configPath, text: "", ...siteBindings(SINGLE_SITE_ID, false) };
}
/** The site's own file as written (alasin.toml with one site). */
function siteRaw(): Table {
  return site.id ? (parse(site.text) as Table) : alasinRaw();
}
const siteLabel = () => (site.id ? ` (site ${site.id})` : "");

/** The effective (environment-merged) raw values: alasin.toml, and the site's file merged into it. */
function effective(): Table {
  const base = selectEnvironment(alasinRaw(), env);
  return site.id ? deepMerge(base, selectEnvironment(siteRaw(), env)) : base;
}
/** Writes a value, a site's own into its file; with --env it goes into [env.<name>.<table>]. */
function setAlasin(table: string, key: string, value: TomlValue) {
  const header = env ? `[env.${env}.${table}]` : `[${table}]`;
  if (site.id && isSiteValue(table, key)) {
    site.text = setValue(site.text, header, key, value);
    writeFileSync(site.path, site.text);
    return;
  }
  alasinText = setValue(alasinText, header, key, value);
  writeFileSync(args.configPath, alasinText);
}

/** The ids of the sites in sites/; none with one site. */
function siteIds(): string[] {
  const dir = sitesDir(args.configPath);
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".toml")).map((f) => f.slice(0, -".toml".length)).sort() : [];
}

// ── wrangler.toml editing ────────────────────────────────────────────────────

let wranglerText = "";
function wranglerRaw(): Table {
  return parse(wranglerText) as Table;
}
function wranglerTarget(): Table {
  const raw = wranglerRaw();
  return env ? (((raw.env as Table | undefined)?.[env] as Table | undefined) ?? {}) : raw;
}
function wranglerHeader(name: string, array = false) {
  const full = env ? `env.${env}${name ? `.${name}` : ""}` : name;
  if (!full) return "";
  return array ? `[[${full}]]` : `[${full}]`;
}
function setWrangler(key: string, value: TomlValue, arrayTable?: { table: string; where: { key: string; value: string } }) {
  wranglerText = arrayTable
    ? setValue(wranglerText, wranglerHeader(arrayTable.table, true), key, value, { where: arrayTable.where })
    : setValue(wranglerText, wranglerHeader(""), key, value);
  writeFileSync(args.wranglerPath, wranglerText);
}

// ── validators ───────────────────────────────────────────────────────────────

/** Asks for an https URL; a bare hostname gets https://. */
async function askUrl(question: string, originOnly: boolean): Promise<string> {
  return normalizeUrl(await ask(question, { validate: (v) => urlProblem(v, { originOnly }) }));
}
const validName = (v: string) => (/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(v) ? null : "letters, digits, '.', '_' and '-' only");
const validBucket = (v: string) => (/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(v) ? null : "3–63 lower-case letters, digits and '-'");

// ── steps ────────────────────────────────────────────────────────────────────

async function checkPrerequisites() {
  step("Checking prerequisites");
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 22) throw new Error(`Node.js ${process.versions.node} is too old; install the current LTS (see ${BEFORE}).`);
  ok(`Node.js ${process.versions.node}`);
  const who = cf.whoami();
  if (!who.loggedIn) throw new Error(`Wrangler is not logged in. Run \`npx wrangler login\` (see ${BEFORE}).`);
  ok(`Wrangler logged in${who.email ? ` as ${who.email}` : ""}`);
  if (who.accounts.length > 1 && !process.env.CLOUDFLARE_ACCOUNT_ID && !wranglerRaw().account_id) {
    info(`Your login can access ${who.accounts.length} Cloudflare accounts:`);
    who.accounts.forEach((a, i) => info(`  ${i + 1}. ${a.name} ${dim(a.id)}`));
    const pick = await ask("Which one should Alasin use? (number)", {
      validate: (v) => (Number(v) >= 1 && Number(v) <= who.accounts.length ? null : "pick a number from the list"),
    });
    setWrangler("account_id", who.accounts[Number(pick) - 1]!.id);
    ok(`account_id saved to ${displayPath(args.wranglerPath)}`);
  }
  if (!cf.r2Enabled()) throw new Error(`R2 isn't enabled on this Cloudflare account (see ${BEFORE}).`);
  ok("R2 is enabled");
}

function ensureFiles() {
  step("Configuration files");
  for (const [path, example] of [
    [args.configPath, "alasin.example.toml"],
    [args.wranglerPath, "wrangler.example.toml"],
  ] as const) {
    if (existsSync(path)) ok(`Using ${displayPath(path)}`);
    else {
      mkdirSync(dirname(path), { recursive: true });
      copyFileSync(join(repoRoot, example), path);
      ok(`Created ${displayPath(path)} from ${example}`);
    }
  }
  alasinText = readText(args.configPath);
  wranglerText = readText(args.wranglerPath);
  const migration = migrateAlasinToml(alasinText, readText(join(repoRoot, "alasin.example.toml")));
  if (migration.changes.length) {
    alasinText = migration.text;
    writeFileSync(args.configPath, alasinText);
    ok(`Updated ${displayPath(args.configPath)} for this Alasin version:`);
    for (const change of migration.changes) info(`  - ${change}`);
  }
  const plainWrangler = plainComments(wranglerText);
  if (plainWrangler !== wranglerText) {
    wranglerText = plainWrangler;
    writeFileSync(args.wranglerPath, wranglerText);
    ok(`Updated ${displayPath(args.wranglerPath)}: comments written in plain ASCII`);
  }
  if (env && !(wranglerRaw().env as Table | undefined)?.[env]) {
    wranglerText = appendSection(wranglerText, envWranglerSection(env, wranglerRaw()));
    writeFileSync(args.wranglerPath, wranglerText);
    ok(`Added [env.${env}] to ${displayPath(args.wranglerPath)}`);
  }
}

async function askAppValues() {
  step(`App${envLabel}`);
  if (isUnset(get(effective(), "app.url"))) {
    info("The app's public address: a hostname on a zone in this Cloudflare account (e.g. alasin.example.com),");
    info("or the Worker's workers.dev address.");
    setAlasin("app", "url", new URL(await askUrl("App address (hostname or URL)", true)).origin);
  }
  ok(`App URL: ${String(get(effective(), "app.url"))}`);
  if (env && !get(effective(), "ui.environment_label")) {
    setAlasin("ui", "environment_label", env.toUpperCase().slice(0, 12));
    ok(`Environment badge: ${env.toUpperCase()}`);
  }
}

async function askSiteValues() {
  step(`Site${siteLabel()}${envLabel}`);
  const e = effective();

  if (isUnset(get(e, "github.owner")) || isUnset(get(e, "github.repo"))) {
    const full = await ask("Site repository on GitHub (owner/name)", {
      validate: (v) => (/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(v) ? null : "use the form owner/name"),
    });
    const [owner, repo] = full.split("/") as [string, string];
    setAlasin("github", "owner", owner);
    setAlasin("github", "repo", repo);
  }
  const owner = String(get(effective(), "github.owner"));
  const repo = String(get(effective(), "github.repo"));
  const vis = await gh.repoVisibility(owner, repo);
  if (vis.status === "public") {
    warn(`Repository ${owner}/${repo} is public.`);
    warn(`Alasin commits drafts to its ${String(get(effective(), "drafts.dir") ?? "drafts")}/ folder, so anyone could read them on GitHub.`);
    info("Recommended: make it private (Settings → General → Danger Zone → Change repository visibility).");
    if (!(await confirm("Continue with a public repository?", false))) {
      throw new Error(`Make ${owner}/${repo} private, then run setup again.`);
    }
  } else {
    ok(`Repository ${owner}/${repo} is private, as recommended (the GitHub App step confirms it exists)`);
  }
  if (!get(siteRaw(), env ? `env.${env}.github.branch` : "github.branch")) {
    const branch = await ask("Branch Alasin commits to", { default: env === "dev" ? "dev" : (vis.defaultBranch ?? "main"), validate: validName });
    setAlasin("github", "branch", branch);
  }
  ok(`Branch: ${String(get(effective(), "github.branch"))}`);

  if (isUnset(get(e, "site.url"))) {
    setAlasin("site", "url", await askUrl("Public address of the site built from that branch", false));
  }
  ok(`Site URL: ${String(get(effective(), "site.url"))}`);
}

function workerName(): string {
  const raw = wranglerRaw();
  if (!env) return String(raw.name ?? "alasin");
  const envTable = ((raw.env as Table | undefined)?.[env] as Table | undefined) ?? {};
  return String(envTable.name ?? `${String(raw.name ?? "alasin")}-${env}`);
}

const validWorker = (v: string) =>
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(v) ? null : "lower-case letters, digits and '-' (not at the ends)";

/**
 * Shows what this deployment is (Worker, address, branch, badge) and lets the
 * operator correct it. The example files default to a production Worker named
 * "alasin" that commits to "main"; a dev deployment needs other values.
 */
async function confirmDeployment() {
  step(`Deployment${envLabel}`);
  const ids = siteIds();
  const show = () => {
    const e = effective();
    const label = get(e, "ui.environment_label") as string | undefined;
    info(`Worker:         ${bold(workerName())}`);
    info(`App address:    ${String(get(e, "app.url"))}`);
    for (const id of ids.length ? ids : [null]) {
      useSite(id);
      const s = effective();
      info(`${id ? `Site ${id}: `.padEnd(16) : "Commits to:     "}${String(get(s, "github.owner"))}/${String(get(s, "github.repo"))}, branch ${bold(String(get(s, "github.branch")))}`);
    }
    info(`Badge in app:   ${label ? label : "none (production)"}`);
  };
  show();
  if (await confirm("Is this right?")) return;
  setWrangler("name", await ask("Worker name", { default: workerName(), validate: validWorker }));
  for (const id of ids.length ? ids : [null]) {
    useSite(id);
    setAlasin("github", "branch", await ask(`Branch to commit to${siteLabel()}`, { default: String(get(effective(), "github.branch")), validate: validName }));
  }
  const current = (get(effective(), "ui.environment_label") as string | undefined) ?? "";
  const label = await ask("Badge for a non-production deployment, e.g. DEV (empty for production)", {
    default: current || undefined,
    validate: (v) => (v.length <= 12 ? null : "at most 12 characters"),
  });
  if (label || current) setAlasin("ui", "environment_label", label);
  show();
}

async function setupBuckets() {
  step(`R2 buckets${siteLabel()}${envLabel}`);
  const target = wranglerTarget();
  const buckets = (target.r2_buckets as Table[] | undefined) ?? [];
  const media = buckets.find((b) => b.binding === site.media) ?? {};
  let mediaName = media.bucket_name as string | undefined;
  let jurisdiction = media.jurisdiction as string | undefined;

  if (isUnset(mediaName)) {
    info(`The site's existing public image bucket (${site.media}). Alasin only adds objects to it; it never overwrites or deletes.`);
    mediaName = await ask(`${site.media} bucket name`, { validate: validBucket });
    jurisdiction = (await ask("Its jurisdiction (e.g. eu), or empty for none", { default: "none", validate: () => null })).toLowerCase();
    if (jurisdiction === "none" || jurisdiction === "") jurisdiction = undefined;
    setWrangler("bucket_name", mediaName, { table: "r2_buckets", where: { key: "binding", value: site.media } });
    if (jurisdiction) setWrangler("jurisdiction", jurisdiction, { table: "r2_buckets", where: { key: "binding", value: site.media } });
  }
  if (!cf.bucketExists(mediaName!, jurisdiction)) {
    throw new Error(
      `Bucket "${mediaName}"${jurisdiction ? ` (jurisdiction ${jurisdiction})` : ""} not found. Check the name and jurisdiction under R2 in the dashboard (Existing Site, step 1, in the wiki).`,
    );
  }
  ok(`${site.media}: ${mediaName}${jurisdiction ? ` (${jurisdiction})` : ""}`);

  if (isUnset(get(effective(), "media.public_url"))) {
    setAlasin(
      "media",
      "public_url",
      (await askUrl("Public address of the MEDIA bucket (its custom domain)", false)).replace(/\/?$/, "/"),
    );
  }
  ok(`Media URL: ${String(get(effective(), "media.public_url"))}`);

  const drafts = buckets.find((b) => b.binding === site.drafts) ?? {};
  let draftsName = drafts.bucket_name as string | undefined;
  if (isUnset(draftsName)) {
    draftsName = await ask(`Name for the private ${site.drafts} bucket`, { default: `${mediaName}-drafts${env ? `-${env}` : ""}`, validate: validBucket });
    setWrangler("bucket_name", draftsName, { table: "r2_buckets", where: { key: "binding", value: site.drafts } });
    if (jurisdiction) setWrangler("jurisdiction", jurisdiction, { table: "r2_buckets", where: { key: "binding", value: site.drafts } });
  }
  const draftsJ = (wranglerTarget().r2_buckets as Table[]).find((b) => b.binding === site.drafts)!.jurisdiction as string | undefined;
  if (draftsName === mediaName && draftsJ === jurisdiction) throw new Error(`${site.drafts} must be a different bucket from ${site.media}.`);
  if (cf.bucketExists(draftsName!, draftsJ)) {
    ok(`${site.drafts}: ${draftsName} (exists)`);
    // Each deployment's daily cleanup removes draft images whose draft isn't on its own branch.
    warn("Use this bucket for this deployment only: deployments sharing a drafts bucket would delete each other's draft images.");
  }
  else {
    const r = cf.createBucket(draftsName!, draftsJ);
    if (!r.ok) throw new Error(`Couldn't create bucket ${draftsName}:\n${r.output}`);
    ok(`${site.drafts}: created ${draftsName}${draftsJ ? ` (${draftsJ})` : ""} — private, no public access`);
  }
}

function setupKv() {
  step(`KV namespace${envLabel}`);
  const kv = ((wranglerTarget().kv_namespaces as Table[] | undefined) ?? []).find((k) => k.binding === "KV");
  if (kv && !isUnset(kv.id)) {
    ok(`KV: ${String(kv.id)}`);
    return;
  }
  const id = cf.ensureKvNamespace(`${workerName()}-sessions`);
  setWrangler("id", id, { table: "kv_namespaces", where: { key: "binding", value: "KV" } });
  ok(`KV: ${workerName()}-sessions (${id})`);
}

function setupDomain() {
  step(`Domain${envLabel}`);
  const host = new URL(String(get(effective(), "app.url"))).hostname;
  if (host.endsWith(".workers.dev")) {
    setWrangler("workers_dev", true);
    // An environment inherits the top-level routes: without its own, deploying it would take
    // production's custom domain.
    if (env && !Array.isArray(wranglerTarget().routes)) {
      setWrangler("routes", []);
      ok(`[env.${env}] gets routes = [], so it never takes production's custom domain`);
    }
    ok(`Using the workers.dev address ${host}`);
    return;
  }
  const routes = (wranglerTarget().routes as Table[] | undefined) ?? [];
  if (routes.some((r) => r.pattern === host && r.custom_domain === true)) ok(`Custom domain ${host}`);
  else {
    setWrangler("routes", [{ pattern: host, custom_domain: true }]);
    ok(`Custom domain ${host} added; Wrangler creates the DNS record and certificate on deploy`);
  }
  // One address per deployment: with a custom domain, the workers.dev address is turned off.
  if (wranglerTarget().workers_dev !== false) {
    setWrangler("workers_dev", false);
    ok("workers.dev address turned off; the app is reached only through its custom domain");
  }
}

async function setupGitHubApp(): Promise<Record<string, string>> {
  step(`GitHub App${envLabel}`);
  const secrets: Record<string, string> = {};
  const existing = cf.listSecrets(args.wranglerPath, env);
  const e = effective();
  const appUrl = String(get(e, "app.url"));
  const owner = String(get(e, "github.owner"));
  const repo = String(get(e, "github.repo"));
  const haveApp = !isUnset(get(e, "github.app_id")) && !isUnset(get(e, "github.client_id"));
  const haveSecrets = existing?.has("GITHUB_CLIENT_SECRET") && existing.has("GITHUB_APP_PRIVATE_KEY");
  let privateKey: string | undefined;

  const rotateGithub = args.flags.has("rotate-github");
  if (rotateGithub && !haveApp) throw new Error("--rotate-github needs a configured GitHub App; run setup without it first.");
  if (haveApp && haveSecrets && !rotateGithub) {
    ok(`GitHub App ${String(get(e, "github.app_id"))} and its secrets are set`);
  } else if (haveApp) {
    info(
      rotateGithub
        ? `Rotating the secrets of GitHub App ${String(get(e, "github.app_id"))}.`
        : `GitHub App ${String(get(e, "github.app_id"))} is configured, but its secrets aren't stored on Worker ${workerName()}.`,
    );
    info("Generate a client secret and a private key on the app's settings page on GitHub.");
    secrets.GITHUB_CLIENT_SECRET = await ask("Client secret");
    const keyPath = await ask("Path to the private key (.pem)", { validate: (v) => (existsSync(v) ? null : "file not found") });
    privateKey = gh.toPkcs8(readText(keyPath));
    secrets.GITHUB_APP_PRIVATE_KEY = privateKey;
  } else {
    const callbacks = [`${appUrl}/auth/callback`];
    const local = await confirm("Also allow logins from local development (http://localhost:8787)?", false);
    if (local) callbacks.push("http://localhost:8787/auth/callback");
    if (await confirm("Create the GitHub App automatically in your browser (recommended)?")) {
      const ownerInfo = await gh.lookupUser(owner);
      const organization = ownerInfo?.type === "Organization" ? owner : undefined;
      if (organization) info(`The app is created under the organisation ${organization}; you need to be an owner of it.`);
      const name = await ask("App name (unique on GitHub, max 34 characters)", {
        default: `Alasin ${repo}${env ? ` ${env}` : ""}`.slice(0, 34),
        validate: (v) => (v.length >= 1 && v.length <= 34 ? null : "1–34 characters"),
      });
      const app = await gh.createAppWithManifest({ name, appUrl, callbackUrls: callbacks, organization, log: info });
      setAlasin("github", "app_id", app.id);
      setAlasin("github", "client_id", app.clientId);
      secrets.GITHUB_CLIENT_SECRET = app.clientSecret;
      secrets.GITHUB_APP_PRIVATE_KEY = app.privateKeyPkcs8;
      privateKey = app.privateKeyPkcs8;
      ok(`Created ${app.htmlUrl}`);
      const current = site.id;
      const repos = (siteIds().length ? siteIds() : [null]).map((id) => {
        useSite(id);
        return `${String(get(effective(), "github.owner"))}/${String(get(effective(), "github.repo"))}`;
      });
      useSite(current);
      info(
        repos.length > 1
          ? `Now install it on each site's repository, on its owner's account (choose "Only select repositories"): ${repos.map((r) => bold(r)).join(", ")}.`
          : `Now install it on ${bold(`${owner}/${repo}`)} only (choose "Only select repositories").`,
      );
      const installUrl = `https://github.com/apps/${app.slug}/installations/new`;
      info(installUrl);
      gh.openBrowser(installUrl);
    } else {
      info(`Create the app as described in the wiki: Existing Site, "Creating the GitHub App by hand". Callback URL(s): ${callbacks.join(", ")}`);
      setAlasin("github", "app_id", Number(await ask("App ID", { validate: (v) => (/^\d+$/.test(v) ? null : "a number") })));
      setAlasin("github", "client_id", await ask("Client ID", { validate: validName }));
      secrets.GITHUB_CLIENT_SECRET = await ask("Client secret");
      const keyPath = await ask("Path to the private key (.pem) you downloaded", {
        validate: (v) => (existsSync(v) ? null : "file not found"),
      });
      privateKey = gh.toPkcs8(readText(keyPath));
      secrets.GITHUB_APP_PRIVATE_KEY = privateKey;
    }
  }

  await installOn(privateKey);
  return secrets;
}

/**
 * The app installed on the sites' repositories. With the private key at hand
 * (a new app, or rotated secrets), every site's installation is found and
 * recorded: a new app isn't installed anywhere yet. Otherwise the operator is
 * asked to install it on the site being added.
 */
async function installOn(privateKey: string | undefined) {
  const appId = Number(get(effective(), "github.app_id"));
  const all = siteIds();
  for (const id of privateKey && all.length ? all : targets) {
    useSite(id);
    const owner = String(get(effective(), "github.owner"));
    const repo = String(get(effective(), "github.repo"));
    if (!isUnset(get(effective(), "github.installation_id"))) continue;
    if (!privateKey) {
      if (!addedSite || id !== addedSite) continue;
      info(`Install the GitHub App on ${bold(`${owner}/${repo}`)}: on GitHub, open the app (Settings → Developer settings → GitHub Apps,`);
      info("or the organisation's), then Install App, and add the repository to the installation on its owner's account.");
      await ask("Press Enter once the app is installed on the repository", { validate: () => null });
      continue;
    }
    for (;;) {
      await ask(`Press Enter once the app is installed on ${owner}/${repo}`, { validate: () => null });
      info("Checking (GitHub can take a few seconds)…");
      const found = await poll(() => gh.findInstallation(appId, privateKey, owner, repo).catch(() => null), Boolean);
      if (found) {
        setAlasin("github", "installation_id", found);
        ok(`Installed on ${owner}/${repo} (installation ${found})`);
        break;
      }
      warn(`Not installed on ${owner}/${repo} yet.`);
      if (!(await confirm("Check again?"))) break;
    }
  }
}

function devVarsPath(): string {
  return join(dirname(args.wranglerPath), env ? `.dev.vars.${env}` : ".dev.vars");
}

const newKey = () => randomBytes(32).toString("base64");

/**
 * Records in alasin.toml when secrets were rotated, for the reminders in
 * `npm run deploy` and the app. Secrets that already existed without a
 * recorded date get today as a starting point.
 */
function recordRotation(existingBefore: Set<string>, stored: Record<string, string>) {
  const day = today();
  const groups = [
    { key: "session_keys_rotated", names: ["SESSION_KEY", "TOKEN_KEY"], label: "session keys" },
    { key: "github_secrets_rotated", names: ["GITHUB_CLIENT_SECRET", "GITHUB_APP_PRIVATE_KEY"], label: "GitHub App secrets" },
  ];
  for (const g of groups) {
    const recorded = get(effective(), `security.${g.key}`) as string | undefined;
    if (g.names.some((n) => n in stored)) {
      setAlasin("security", g.key, day);
      ok(`Recorded ${g.label} rotation: ${day}`);
    } else if (!recorded && g.names.every((n) => existingBefore.has(n))) {
      setAlasin("security", g.key, day);
      info(dim(`No rotation date was recorded for the ${g.label}; today (${day}) is the starting point for reminders.`));
    }
  }
}

async function storeSecrets(fromApp: Record<string, string>) {
  step(`Worker secrets${envLabel}`);
  const existing = cf.listSecrets(args.wranglerPath, env) ?? new Set<string>();
  const secrets = { ...fromApp };
  for (const name of ["SESSION_KEY", "TOKEN_KEY"]) {
    if (!existing.has(name) || args.flags.has("rotate-keys")) secrets[name] = newKey();
  }
  if (Object.keys(secrets).length) {
    cf.putSecrets(args.wranglerPath, env, secrets);
    ok(`Stored ${Object.keys(secrets).join(", ")}`);
    if (args.flags.has("rotate-keys")) info("Session keys rotated: everyone has to log in again.");
  }
  recordRotation(existing, secrets);
  const after = cf.listSecrets(args.wranglerPath, env) ?? new Set<string>();
  const missing = REQUIRED_SECRETS.filter((s) => !after.has(s));
  if (missing.length) warn(`Still missing: ${missing.join(", ")}. Run setup again or set them with \`npx wrangler secret put\`.`);
  else ok("All secrets present");

  if (!existsSync(devVarsPath()) && fromApp.GITHUB_CLIENT_SECRET) {
    if (await confirm(`Write ${displayPath(devVarsPath())} for local development (npm run dev)?`, false)) {
      const lines = [
        "# Local development secrets for `npm run dev`. Never commit this file.",
        `SESSION_KEY=${newKey()}`,
        `TOKEN_KEY=${newKey()}`,
        `GITHUB_CLIENT_SECRET=${fromApp.GITHUB_CLIENT_SECRET}`,
        `GITHUB_APP_PRIVATE_KEY="${(fromApp.GITHUB_APP_PRIVATE_KEY ?? "").trim().replace(/\n/g, "\\n")}"`,
      ];
      writeFileSync(devVarsPath(), `${lines.join("\n")}\n`, { mode: 0o600 });
      ok(`Wrote ${displayPath(devVarsPath())}`);
    }
  }
}

function finalCheck() {
  step("Checking the result");
  const deployment = loadDeployment(args.configPath, env);
  const config = deployment.sites[0]!.config;
  ok(`${displayPath(args.configPath)}${deployment.multi ? ` and ${deployment.sites.length} sites in ${displayPath(sitesDir(args.configPath))}` : ""}${envLabel} ${deployment.multi ? "are" : "is"} valid`);
  const problems = checkBindings(wranglerTarget(), `${displayPath(args.wranglerPath)}${envLabel}`, deployment.sites);
  if (problems.length) throw new ConfigError(problems.join("\n"), problems);
  generateWranglerConfig({ wranglerPath: args.wranglerPath, env, deployment, outName: env ?? "default" });
  ok(`${displayPath(args.wranglerPath)}${envLabel} is complete`);
  const deployArgs = [
    args.site && !args.siteImplicit ? `--site ${args.site}` : !args.site && args.configPath !== join(repoRoot, "alasin.toml") ? `--config ${displayPath(args.configPath)}` : "",
    env ? `--env ${env}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  console.log(`\n${bold("Done.")} Deploy with:\n\n    npm run deploy${deployArgs ? ` -- ${deployArgs}` : ""}\n\nthen open ${config.app.url} and log in with GitHub.`);
}

/** The sites setup works on: all of them (null: the one site), or the one --add-site adds. */
let targets: (string | null)[] = [null];
let addedSite: string | null = null;

/** --add-site <id>: the value after it, or in --add-site=<id>. */
function addSiteArg(): string | null {
  const i = args.rest.indexOf("--add-site");
  if (i >= 0) {
    const v = args.rest[i + 1];
    if (!v || v.startsWith("--")) throw new Error("--add-site needs the new site's id, e.g. --add-site blog");
    return v;
  }
  const eq = args.rest.find((a) => a.startsWith("--add-site="));
  return eq ? eq.slice("--add-site=".length) : null;
}

/**
 * The deployment's sites: with --add-site, a deployment with one site is first
 * split into alasin.toml and sites/<its id>.toml (its buckets renamed for it in
 * wrangler.toml), and the new site's file is made from the example to fill in.
 */
async function prepareSites() {
  addedSite = addSiteArg();
  if (addedSite) {
    const problem = siteIdProblem(addedSite);
    if (problem) throw new Error(`--add-site ${addedSite}: ${problem}.`);
    const dir = sitesDir(args.configPath);
    if (!siteIds().length) {
      step("Sites");
      info("This deployment has one site, set up in alasin.toml. To add another, its own settings move to");
      info(`${displayPath(dir)}/<id>.toml, and its buckets are named for it in ${displayPath(args.wranglerPath)}.`);
      info("The id is in the app's addresses for the site (/<id>/posts). Have everyone save drafts kept only on their devices first:");
      info("the app keeps device drafts per site, so ones from before aren't shown afterwards.");
      const repo = String(get(selectEnvironment(alasinRaw(), env), "github.repo") ?? "site");
      const id = await ask("Id for the site already set up", { default: suggestSiteId(repo), validate: (v) => siteIdProblem(v) ?? (v === addedSite ? "that's the new site's id" : null) });
      // [env.<name>] overrides of the site's own values belong in its file's [env.<name>]: moved by hand.
      const envs = (alasinRaw().env as Table | undefined) ?? {};
      const overridden = Object.entries(envs).flatMap(([name, t]) =>
        Object.entries((t as Table) ?? {}).flatMap(([table, values]) =>
          Object.keys((values as Table) ?? {}).filter((key) => isSiteValue(table, key)).map((key) => `env.${name}.${table}.${key}`),
        ),
      );
      if (overridden.length) {
        throw new Error(
          `${displayPath(args.configPath)} overrides the site's own values for an environment (${overridden.join(", ")}). Move those into sites/${id}.toml under the same [env.<name>] tables by hand, then run setup again.`,
        );
      }
      const split = splitSiteConfig(alasinText);
      if (!split) throw new Error(`${displayPath(args.configPath)} has no section banners to split it at. Move the site's sections to sites/${id}.toml by hand (Configuration Files in the wiki).`);
      if (!(await confirm(`Move the site's settings to sites/${id}.toml and rename its buckets to ${siteBindings(id, true).media} and ${siteBindings(id, true).drafts}?`))) {
        throw new Error("Nothing was changed.");
      }
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${id}.toml`), split.site);
      alasinText = split.app;
      writeFileSync(args.configPath, alasinText);
      const b = siteBindings(id, true);
      wranglerText = renameBucketBindings(wranglerText, b.media, b.drafts);
      writeFileSync(args.wranglerPath, wranglerText);
      ok(`Moved the site's settings to ${displayPath(join(dir, `${id}.toml`))}; its buckets are ${b.media} and ${b.drafts}`);
    }
    const file = join(dir, `${addedSite}.toml`);
    if (existsSync(file)) ok(`Using ${displayPath(file)}`);
    else {
      // The branch is asked for (the repository's default branch offered), and written where the example has it.
      writeFileSync(file, siteTemplate(readText(join(repoRoot, "alasin.example.toml"))).replace(/^branch = "main"$/m, '# branch = "main"'));
      ok(`Created ${displayPath(file)} from alasin.example.toml`);
    }
    targets = [addedSite];
  } else {
    const ids = siteIds();
    targets = ids.length ? ids : [null];
  }
  useSite(targets[0]!);
}

async function main() {
  const addSite = args.rest.indexOf("--add-site");
  const unexpected = args.rest.filter(
    (a, i) => a !== "--rotate-keys" && a !== "--rotate-github" && a !== "--add-site" && !a.startsWith("--add-site=") && !(addSite >= 0 && i === addSite + 1),
  );
  if (unexpected.length) {
    throw new Error(
      `Unexpected argument(s): ${unexpected.join(" ")}. Options: --env <name>, --site <name>, --config <alasin.toml>, --wrangler-config <wrangler.toml>, --rotate-keys, --rotate-github, --add-site <id>.`,
    );
  }
  console.log(bold(`Alasin setup — environment: ${env ?? "default (production)"}`));
  const deployment = deploymentLine(args);
  if (deployment) console.log(deployment);
  console.log(dim(`alasin.toml:   ${displayPath(args.configPath)}\nwrangler.toml: ${displayPath(args.wranglerPath)}`));
  ensureFiles();
  await prepareSites();
  await checkPrerequisites();
  await askAppValues();
  for (const id of targets) {
    useSite(id);
    await askSiteValues();
  }
  await confirmDeployment();
  for (const id of targets) {
    useSite(id);
    await setupBuckets();
  }
  useSite(targets[0]!);
  setupKv();
  setupDomain();
  const appSecrets = await setupGitHubApp();
  await storeSecrets(appSecrets);
  finalCheck();
}

main()
  .then(() => {
    closePrompt();
    // Anything still open (e.g. a browser's connection to the GitHub App step) mustn't keep the process
    // running: create-site waits for setup to exit before it deploys.
    process.exit(0);
  })
  .catch((err: unknown) => {
    closePrompt();
    console.error(`\n${red("Setup stopped:")} ${err instanceof Error ? err.message : String(err)}`);
    console.error(dim("Fix the problem and run setup again; finished steps are skipped."));
    process.exit(1);
  });
