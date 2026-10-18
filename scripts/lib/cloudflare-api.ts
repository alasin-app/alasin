// SPDX-License-Identifier: MIT
// Cloudflare's API, for what Wrangler has no command for (e.g. finding a
// domain's zone). Uses Wrangler's login (`wrangler auth token`) or
// CLOUDFLARE_API_TOKEN; the token is kept in memory only, never written or
// printed.

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

export async function cloudflareApi<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${apiToken()}`, "Content-Type": "application/json" },
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
