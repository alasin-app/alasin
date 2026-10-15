// SPDX-License-Identifier: MIT
// Wrangler operations used by setup. All of them are idempotent.

import { capture } from "../lib/proc";

export interface WhoAmI {
  loggedIn: boolean;
  email?: string;
  accounts: { id: string; name: string }[];
}

export function whoami(): WhoAmI {
  const r = capture("wrangler", ["whoami", "--json"]);
  if (r.code !== 0) return { loggedIn: false, accounts: [] };
  try {
    const data = JSON.parse(r.stdout) as { email?: string; accounts?: { id: string; name: string }[] };
    return { loggedIn: true, email: data.email, accounts: data.accounts ?? [] };
  } catch {
    return { loggedIn: true, accounts: [] };
  }
}

function jurisdictionArgs(j: string | undefined) {
  return j ? ["--jurisdiction", j] : [];
}

/** True if R2 is usable on the account (listing works). */
export function r2Enabled(): boolean {
  return capture("wrangler", ["r2", "bucket", "list"]).code === 0;
}

export function bucketExists(name: string, jurisdiction?: string): boolean {
  return capture("wrangler", ["r2", "bucket", "info", name, ...jurisdictionArgs(jurisdiction)]).code === 0;
}

export function createBucket(name: string, jurisdiction?: string): { ok: boolean; output: string } {
  const r = capture("wrangler", ["r2", "bucket", "create", name, ...jurisdictionArgs(jurisdiction)]);
  return { ok: r.code === 0, output: r.stderr || r.stdout };
}

/** Finds a KV namespace by title or creates it; returns its ID. */
export function ensureKvNamespace(title: string): string {
  const list = capture("wrangler", ["kv", "namespace", "list"]);
  if (list.code === 0) {
    const start = list.stdout.indexOf("[");
    const namespaces = JSON.parse(list.stdout.slice(start)) as { id: string; title: string }[];
    const found = namespaces.find((n) => n.title === title);
    if (found) return found.id;
  }
  const created = capture("wrangler", ["kv", "namespace", "create", title]);
  const id = /\b([0-9a-f]{32})\b/.exec(created.stdout + created.stderr)?.[1];
  if (created.code !== 0 || !id) throw new Error(`Couldn't create KV namespace "${title}":\n${created.stderr || created.stdout}`);
  return id;
}

/** Secret names of a Worker, or null if the Worker doesn't exist yet. */
export function listSecrets(wranglerPath: string, env: string | undefined): Set<string> | null {
  const r = capture("wrangler", ["secret", "list", "--format", "json", "--config", wranglerPath, ...(env ? ["--env", env] : [])]);
  if (r.code !== 0) return null;
  try {
    return new Set((JSON.parse(r.stdout) as { name: string }[]).map((s) => s.name));
  } catch {
    return null;
  }
}

/** Stores secrets; creates a placeholder Worker if it doesn't exist yet. Values go through stdin only. */
export function putSecrets(wranglerPath: string, env: string | undefined, secrets: Record<string, string>): void {
  const r = capture("wrangler", ["secret", "bulk", "--config", wranglerPath, ...(env ? ["--env", env] : [])], JSON.stringify(secrets));
  if (r.code !== 0) throw new Error(`wrangler secret bulk failed:\n${(r.stderr || r.stdout).slice(0, 2000)}`);
}
