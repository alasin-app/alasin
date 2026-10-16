// SPDX-License-Identifier: MIT
//
// Tokens of the GitHub App's installation on the site repository, for work
// without a signed-in user (the nightly cleanup). A short-lived JWT signed
// with the app's private key (RS256) is exchanged for an installation token,
// asked for read access to contents only.

import { GitHubError } from "./github";
import { toBase64 } from "./encoding";

const b64url = (bytes: Uint8Array) => toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const text = (s: string) => new TextEncoder().encode(s);

/** A JWT for the GitHub App, valid for 9 minutes (GitHub allows at most 10). */
export async function appJwt(appId: number, privateKeyPem: string, now = Date.now()): Promise<string> {
  const der = Uint8Array.from(atob(privateKeyPem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (ch) => ch.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const seconds = Math.floor(now / 1000);
  // Issued a minute early against clock drift.
  const header = b64url(text(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = b64url(text(JSON.stringify({ iat: seconds - 60, exp: seconds + 9 * 60, iss: String(appId) })));
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, text(`${header}.${payload}`)));
  return `${header}.${payload}.${b64url(signature)}`;
}

/** A read-only installation token for one repository. */
export async function installationToken(appId: number, privateKeyPem: string, owner: string, repo: string): Promise<string> {
  const jwt = await appJwt(appId, privateKeyPem);
  const headers = { Authorization: `Bearer ${jwt}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Alasin" };
  const found = await fetch(`https://api.github.com/repos/${owner}/${repo}/installation`, { headers });
  if (!found.ok) throw new GitHubError(`finding the app's installation returned ${found.status}`, found.status);
  const { id } = (await found.json()) as { id: number };
  const res = await fetch(`https://api.github.com/app/installations/${id}/access_tokens`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ repositories: [repo], permissions: { contents: "read" } }),
  });
  if (!res.ok) throw new GitHubError(`creating an installation token returned ${res.status}`, res.status);
  return ((await res.json()) as { token: string }).token;
}
