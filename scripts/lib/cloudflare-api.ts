// SPDX-License-Identifier: MIT
// Cloudflare's API, for what Wrangler has no command for (finding a domain's
// zone, attaching a Worker's domain, Workers Builds). Uses Wrangler's login
// (`wrangler auth token`) or CLOUDFLARE_API_TOKEN; Workers Builds, which
// refuses Wrangler's login, a user API token in CLOUDFLARE_BUILDS_TOKEN.
// Tokens are kept in memory only, never written or printed.

import { zoneCandidates } from "./create-site";
import { capture } from "./proc";

let token: string | undefined;

function apiToken(): string {
  if (token) return token;
  if (process.env.CLOUDFLARE_API_TOKEN) return (token = process.env.CLOUDFLARE_API_TOKEN);
  const r = capture("wrangler", ["auth", "token", "--json"]);
  if (r.code !== 0) throw new Error("Not logged in to Cloudflare: run npx wrangler login");
  const value = (JSON.parse(r.stdout) as { token?: string }).token;
  if (!value) throw new Error("Wrangler gave no token: run npx wrangler login");
  return (token = value);
}

/** The user API token for Workers Builds (Workers CI: Edit, Workers: read), or an error saying how to set it. */
export function buildsToken(): string {
  const value = process.env.CLOUDFLARE_BUILDS_TOKEN;
  if (!value) {
    throw new Error(
      "Workers Builds needs a user API token (My Profile → API Tokens: Workers CI · Edit and Workers · Metadata Read-only) in CLOUDFLARE_BUILDS_TOKEN.\n" +
        "Set it without it showing or staying in the shell's history:  read -rs CLOUDFLARE_BUILDS_TOKEN && export CLOUDFLARE_BUILDS_TOKEN",
    );
  }
  return value;
}

/** The Cloudflare account: CLOUDFLARE_ACCOUNT_ID, or the only one Wrangler's login has. */
export function accountId(): string {
  if (process.env.CLOUDFLARE_ACCOUNT_ID) return process.env.CLOUDFLARE_ACCOUNT_ID;
  const r = capture("wrangler", ["whoami", "--json"]);
  const accounts = r.code === 0 ? ((JSON.parse(r.stdout.slice(r.stdout.indexOf("{"))) as { accounts?: { id: string }[] }).accounts ?? []) : [];
  if (accounts.length !== 1) throw new Error(accounts.length ? "Several Cloudflare accounts: set CLOUDFLARE_ACCOUNT_ID." : "Not logged in to Cloudflare: run npx wrangler login");
  return accounts[0]!.id;
}

export async function cloudflareApi<T>(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${init.token ?? apiToken()}`, "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; result?: T; errors?: { message: string }[] };
  if (!res.ok || !data.success) throw new Error(`Cloudflare API ${path}: ${data.errors?.map((e) => e.message).join("; ") || res.status}`);
  return data.result as T;
}

/** The zone of the account a hostname belongs to, or null if none of its zones is there. */
export async function zoneFor(host: string): Promise<{ id: string; name: string } | null> {
  for (const name of zoneCandidates(host)) {
    const zones = await cloudflareApi<{ id: string; name: string }[]>(`/zones?name=${encodeURIComponent(name)}`);
    if (zones.length) return { id: zones[0]!.id, name: zones[0]!.name };
  }
  return null;
}
