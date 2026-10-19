// SPDX-License-Identifier: MIT
// The site's Worker: created with a placeholder page, given its production
// domain, and connected to the site repository with Cloudflare Workers Builds
// (main deploys production; every other branch uploads a preview version, so
// the dev branch is the dev site). Each step skips what's already there.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accountId, buildsToken, cloudflareApi, zoneFor } from "./cloudflare-api";
import { BUILD_TRIGGERS } from "./create-site";
import { capture } from "./proc";

/** Creates the Worker with a one-page placeholder, until its first build replaces it. */
export function createPlaceholderWorker(name: string) {
  const dir = mkdtempSync(join(tmpdir(), "alasin-site-worker-"));
  try {
    writeFileSync(join(dir, "index.html"), "<!doctype html><meta charset=utf-8><title>Building…</title><p>The site is being built.</p>\n");
    const r = capture("wrangler", ["deploy", "--cwd", dir, "--name", name, "--assets", dir, "--compatibility-date", "2026-10-01"]);
    if (r.code !== 0) throw new Error(`wrangler deploy ${name} failed:\n${(r.stderr || r.stdout).slice(-2000)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Serves the Worker on a custom domain (production). */
export async function attachDomain(worker: string, hostname: string) {
  const zone = await zoneFor(hostname);
  if (!zone) throw new Error(`${hostname}: none of its zones is in this Cloudflare account`);
  await cloudflareApi(`/accounts/${accountId()}/workers/domains`, { method: "PUT", body: { environment: "production", hostname, service: worker, zone_id: zone.id } });
}

interface Trigger {
  trigger_uuid: string;
  trigger_name: string;
  branch_includes: string[];
  branch_excludes: string[];
  build_token_uuid?: string;
}

export interface BuildToken {
  build_token_uuid: string;
  build_token_name?: string;
}

/**
 * Connects the repository to the Worker with Workers Builds and starts the
 * first builds (main, and dev for the dev site). Returns the started builds.
 * `chooseToken` picks the account's build token (the token Workers Builds
 * deploys with) when there are several: some may have been deleted or rolled,
 * and the API doesn't say which. Existing triggers are switched to it.
 */
export async function connectBuilds(worker: string, repository: string, chooseToken: (tokens: BuildToken[]) => Promise<BuildToken>): Promise<{ branch: string; build: string }[]> {
  const token = buildsToken();
  const acc = accountId();
  const api = <T>(path: string, init: { method?: string; body?: unknown } = {}) => cloudflareApi<T>(`/accounts/${acc}${path}`, { ...init, token });

  const gh = spawnSync("gh", ["api", `repos/${repository}`, "--jq", "[.id, .owner.id, .owner.login, .owner.type, .name] | @tsv"], { encoding: "utf8" });
  if (gh.status !== 0) throw new Error(`GitHub: ${repository} can't be read (gh auth login)`);
  const [repoId, ownerId, owner, ownerType, repo] = gh.stdout.trim().split("\t");

  let connection: { repo_connection_uuid: string };
  try {
    connection = await api("/builds/repos/connections", {
      method: "PUT",
      body: { provider_type: "github", provider_account_id: ownerId, provider_account_name: owner, repo_id: repoId, repo_name: repo },
    });
  } catch (err) {
    const message = (err as Error).message;
    // The Builds API answers "Invalid token" for account-owned tokens; it needs a user token.
    const hint = /invalid token|authentication|unauthori[sz]ed|forbidden|\b10000\b/i.test(message)
      ? "The token isn't accepted: Workers Builds needs a user API token, made under My Profile → API Tokens (not Manage Account → API Tokens), with Workers CI · Edit and Workers · Metadata Read-only."
      : `Cloudflare's GitHub app must be installed on ${owner}, the repository's owner, and see ${repository}. ` +
        `Check under ${ownerType === "Organization" ? `https://github.com/organizations/${owner}/settings/installations` : "https://github.com/settings/installations"} → Cloudflare Workers and Pages → Configure → Repository access. ` +
        `If it isn't listed there, install it on ${owner}: in the Cloudflare dashboard, Workers & Pages → Create → Import a repository → GitHub, and pick ${owner} when GitHub asks where to install it.`;
    throw new Error(`${message}\n${hint}`, { cause: err });
  }

  const scripts = await api<{ id: string; tag: string }[]>("/workers/scripts");
  const tag = scripts.find((s) => s.id === worker)?.tag;
  if (!tag) throw new Error(`Worker ${worker} not found in the account`);

  const tokens = await api<BuildToken[]>("/builds/tokens");
  if (!tokens.length) throw new Error("This account has no Workers Builds token yet: connect any Worker to GitHub once in the dashboard (Settings → Builds → Connect), then run again.");
  const buildToken = tokens.length === 1 ? tokens[0]! : await chooseToken(tokens);

  const existing = await api<Trigger[]>(`/builds/workers/${tag}/triggers`).catch(() => [] as Trigger[]);
  const started: { branch: string; build: string }[] = [];
  for (const t of BUILD_TRIGGERS) {
    let trigger = existing.find((e) => e.trigger_name === t.trigger_name);
    if (trigger && trigger.build_token_uuid !== buildToken.build_token_uuid) {
      trigger = await api<Trigger>(`/builds/triggers/${trigger.trigger_uuid}`, { method: "PATCH", body: { build_token_uuid: buildToken.build_token_uuid } });
    }
    trigger ??= await api<Trigger>("/builds/triggers", {
      method: "POST",
      body: {
        external_script_id: tag,
        repo_connection_uuid: connection.repo_connection_uuid,
        build_token_uuid: buildToken.build_token_uuid,
        trigger_name: t.trigger_name,
        // The build itself is in wrangler.jsonc (scripts/build.sh), so Wrangler runs it before deploying.
        build_command: "",
        deploy_command: t.deploy_command,
        root_directory: "/",
        branch_includes: t.branch_includes,
        branch_excludes: t.branch_excludes,
        path_includes: ["*"],
        path_excludes: [],
      },
    });
    const build = await api<{ build_uuid: string }>(`/builds/triggers/${trigger.trigger_uuid}/builds`, { method: "POST", body: { branch: t.branch } });
    started.push({ branch: t.branch, build: build.build_uuid });
  }
  return started;
}
