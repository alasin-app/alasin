// SPDX-License-Identifier: MIT
// GitHub helpers for setup: username → ID lookup, the App Manifest flow
// (creates the GitHub App with the right permissions in one click), and
// finding the app's installation on the site repository.

import { createPrivateKey, createSign, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

const API = "https://api.github.com";
const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Alasin-setup" };

export async function lookupUser(login: string): Promise<{ id: number; login: string; type: string } | null> {
  const res = await fetch(`${API}/users/${encodeURIComponent(login)}`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub returned ${res.status} for user ${login}`);
  return (await res.json()) as { id: number; login: string; type: string };
}

/** "public", "private-or-missing" (404 without auth), or "error". */
export async function repoVisibility(owner: string, repo: string): Promise<{ status: "public" | "private-or-missing"; defaultBranch?: string }> {
  const res = await fetch(`${API}/repos/${owner}/${repo}`, { headers });
  if (res.status === 404) return { status: "private-or-missing" };
  if (!res.ok) throw new Error(`GitHub returned ${res.status} for ${owner}/${repo}`);
  const data = (await res.json()) as { private: boolean; default_branch: string };
  return { status: data.private ? "private-or-missing" : "public", defaultBranch: data.default_branch };
}

export function openBrowser(url: string) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    // The URL is printed as well.
  }
}

export interface CreatedApp {
  id: number;
  slug: string;
  clientId: string;
  clientSecret: string;
  /** PKCS#8 PEM, the format Web Crypto in the Worker imports. */
  privateKeyPkcs8: string;
  htmlUrl: string;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * GitHub App Manifest flow: serves a local page that posts the manifest to
 * GitHub, waits for GitHub to redirect back with a one-time code, and
 * exchanges it for the app's credentials.
 */
export async function createAppWithManifest(opts: {
  name: string;
  appUrl: string;
  callbackUrls: string[];
  organization?: string;
  log: (msg: string) => void;
}): Promise<CreatedApp> {
  const state = randomBytes(24).toString("hex");
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const port = (server.address() as { port: number }).port;
      if (url.pathname === "/") {
        const manifest = {
          name: opts.name,
          url: opts.appUrl,
          description: "Login and commits for the Alasin editor.",
          // Public: GitHub hides a private app from everyone but its owner, so
          // other users couldn't even sign in. Who may log in is decided by
          // [users] allow, and the app only reaches the repository it's installed on.
          public: true,
          redirect_url: `http://127.0.0.1:${port}/callback`,
          callback_urls: opts.callbackUrls,
          request_oauth_on_install: false,
          setup_on_update: false,
          hook_attributes: { url: opts.appUrl, active: false },
          default_permissions: { contents: "write", metadata: "read" },
          default_events: [],
        };
        const action = opts.organization
          ? `https://github.com/organizations/${encodeURIComponent(opts.organization)}/settings/apps/new?state=${state}`
          : `https://github.com/settings/apps/new?state=${state}`;
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<!doctype html><meta charset="utf-8"><title>Create GitHub App</title>
<body style="font:17px -apple-system,system-ui,sans-serif;max-width:32em;margin:4em auto;padding:0 1em">
<h1>Create the GitHub App</h1>
<p>Continue to GitHub to create <b>${escapeHtml(opts.name)}</b> with read &amp; write access to repository contents.</p>
<form method="post" action="${escapeHtml(action)}"><input type="hidden" name="manifest" value="${escapeHtml(JSON.stringify(manifest))}">
<button type="submit" style="font:inherit;padding:.6em 1.2em">Continue to GitHub</button></form></body>`);
        return;
      }
      if (url.pathname === "/callback") {
        const code = url.searchParams.get("code");
        if (url.searchParams.get("state") !== state || !code) {
          res.writeHead(400, { "Content-Type": "text/plain" }).end("State mismatch. Run setup again.");
          return;
        }
        try {
          const conv = await fetch(`${API}/app-manifests/${encodeURIComponent(code)}/conversions`, { method: "POST", headers });
          if (!conv.ok) throw new Error(`GitHub returned ${conv.status} for the manifest conversion`);
          const data = (await conv.json()) as { id: number; slug: string; client_id: string; client_secret: string; pem: string; html_url: string };
          const pkcs8 = createPrivateKey(data.pem).export({ type: "pkcs8", format: "pem" }).toString();
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`<!doctype html><meta charset="utf-8"><body style="font:17px -apple-system,system-ui,sans-serif;max-width:32em;margin:4em auto">
<h1>GitHub App created</h1><p>You can close this tab and return to the terminal.</p></body>`);
          server.close();
          resolve({ id: data.id, slug: data.slug, clientId: data.client_id, clientSecret: data.client_secret, privateKeyPkcs8: pkcs8, htmlUrl: data.html_url });
        } catch (err) {
          res.writeHead(500, { "Content-Type": "text/plain" }).end("Creating the app failed; see the terminal.");
          server.close();
          reject(err);
        }
        return;
      }
      res.writeHead(404).end();
    });
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      const url = `http://127.0.0.1:${port}/`;
      opts.log(`Opening ${url} — if no browser opens, open it yourself.`);
      openBrowser(url);
    });
  });
}

/** Converts a GitHub App private key (PKCS#1 or PKCS#8 PEM) to PKCS#8 PEM. */
export function toPkcs8(pem: string): string {
  return createPrivateKey(pem).export({ type: "pkcs8", format: "pem" }).toString();
}

function appJwt(appId: number, privateKey: string): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iat: now - 60, exp: now + 540, iss: String(appId) })}`;
  const sig = createSign("RSA-SHA256").update(body).sign(privateKey).toString("base64url");
  return `${body}.${sig}`;
}

/** The app's installation ID on the repository, or null if it isn't installed there. */
export async function findInstallation(appId: number, privateKey: string, owner: string, repo: string): Promise<number | null> {
  const res = await fetch(`${API}/repos/${owner}/${repo}/installation`, {
    headers: { ...headers, Authorization: `Bearer ${appJwt(appId, privateKey)}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub returned ${res.status} looking up the installation`);
  return ((await res.json()) as { id: number }).id;
}
