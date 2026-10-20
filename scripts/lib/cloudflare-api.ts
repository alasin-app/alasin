// SPDX-License-Identifier: MIT
// Cloudflare's API, for what Wrangler has no command for (finding a domain's
// zone, attaching a Worker's domain, Workers Builds). Uses Wrangler's login
// (`wrangler auth token`) or CLOUDFLARE_API_TOKEN; Workers Builds, which
// refuses Wrangler's login, a user API token in CLOUDFLARE_BUILDS_TOKEN.
// Tokens are kept in memory only, never written or printed.

import { lookup, Resolver } from "node:dns/promises";
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
  // The account ID in the path isn't secret, but it isn't needed in messages either.
  const shown = path.replace(/\/accounts\/[0-9a-f]{32}/, "/accounts/<account>");
  if (!res.ok || !data.success) throw new Error(`Cloudflare API ${shown}: ${data.errors?.map((e) => e.message).join("; ") || res.status}`);
  return data.result as T;
}

/** The zone of the account a hostname belongs to, or null if none of its zones is there. */
export async function zoneFor(host: string): Promise<{ id: string; name: string; nameServers: string[] } | null> {
  for (const name of zoneCandidates(host)) {
    const zones = await cloudflareApi<{ id: string; name: string; name_servers?: string[] }[]>(`/zones?name=${encodeURIComponent(name)}`);
    if (zones.length) return { id: zones[0]!.id, name: zones[0]!.name, nameServers: zones[0]!.name_servers ?? [] };
  }
  return null;
}

/**
 * Whether a hostname is already in use in this account: a Worker's custom
 * domain (asked through the API), or any address or alias record (asked of the
 * zone's own Cloudflare nameservers). Never through the computer's resolver,
 * which would remember a "not found" for a while after the name is created.
 * null: its zone isn't in this account, or it couldn't be asked.
 */
export async function hostnameInUse(host: string): Promise<boolean | null> {
  try {
    const zone = await zoneFor(host);
    if (!zone) return null;
    const domains = await cloudflareApi<{ hostname: string }[]>(`/accounts/${accountId()}/workers/domains?hostname=${encodeURIComponent(host)}`);
    if (domains.some((d) => d.hostname === host)) return true;
    const ips = (await Promise.all(zone.nameServers.map((ns) => lookup(ns, { all: true }).catch(() => [])))).flat().map((a) => a.address);
    if (!ips.length) return null;
    const resolver = new Resolver({ timeout: 5000, tries: 2 });
    resolver.setServers(ips);
    const found = await Promise.all(
      [resolver.resolve4(host), resolver.resolve6(host), resolver.resolveCname(host)].map((p) =>
        p.then(
          (r) => r.length > 0,
          (err: { code?: string }) => (err.code === "ENODATA" || err.code === "ENOTFOUND" ? false : null),
        ),
      ),
    );
    if (found.includes(true)) return true;
    return found.includes(null) ? null : false;
  } catch {
    return null;
  }
}

/** Every object key in an R2 bucket (through the API: Wrangler can't list a bucket's objects). */
export async function listObjects(bucket: string, jurisdiction?: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId()}/r2/buckets/${bucket}/objects?per_page=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      { headers: { Authorization: `Bearer ${apiToken()}`, ...(jurisdiction ? { "cf-r2-jurisdiction": jurisdiction } : {}) } },
    );
    const data = (await res.json().catch(() => ({}))) as { success?: boolean; result?: { key: string }[]; result_info?: { cursor?: string; is_truncated?: boolean }; errors?: { message: string }[] };
    if (!res.ok || !data.success) throw new Error(`Listing ${bucket}: ${data.errors?.map((e) => e.message).join("; ") || res.status}`);
    keys.push(...(data.result ?? []).map((o) => o.key));
    cursor = data.result_info?.is_truncated ? data.result_info.cursor : undefined;
  } while (cursor);
  return keys;
}

/** Deletes one object from an R2 bucket. */
export async function deleteObject(bucket: string, key: string, jurisdiction?: string): Promise<void> {
  const path = key.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId()}/r2/buckets/${bucket}/objects/${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiToken()}`, ...(jurisdiction ? { "cf-r2-jurisdiction": jurisdiction } : {}) },
  });
  if (!res.ok && res.status !== 404) throw new Error(`Deleting ${bucket}/${key}: ${res.status}`);
}

/** DELETE through the API; something already gone (404) counts as done. */
export async function apiDelete(path: string, headers: Record<string, string> = {}): Promise<void> {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, { method: "DELETE", headers: { Authorization: `Bearer ${apiToken()}`, ...headers } });
  if (res.ok || res.status === 404) return;
  const data = (await res.json().catch(() => ({}))) as { errors?: { message: string }[] };
  const shown = path.replace(/\/accounts\/[0-9a-f]{32}/, "/accounts/<account>");
  throw new Error(`Cloudflare API DELETE ${shown}: ${data.errors?.map((e) => e.message).join("; ") || res.status}`);
}
