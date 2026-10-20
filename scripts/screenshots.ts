// SPDX-License-Identifier: MIT
//
// npm run screenshots [-- --site <name>] [--out <dir>]
//
// Screenshots of the app for alasin.app (#353): runs Alasin locally (npm run
// dev --https) with a test site's configuration (default app.alasin.dev, with the
// sample content), signs in as the user `gh` is logged in as (a session made
// with their gh token, written to the local KV), and takes the same set every
// time: iPhone and desktop sizes (Chromium), light and dark, with the DEV
// badge hidden. Needs the site's .dev.vars (setup writes it) and the browsers
// (npx playwright install chromium). The images go to --out (default
// .alasin/screenshots/).

import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, devices, request } from "playwright";
import { loadAlasinConfig } from "./lib/config";
import { DEPLOYMENTS, repoRoot } from "./lib/args";

const argv = process.argv.slice(2).filter((a) => a !== "--");
const option = (name: string, fallback: string) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1]!;
};
const site = option("--site", "app.alasin.dev");
const out = option("--out", join(repoRoot, ".alasin", "screenshots"));
const dir = join(repoRoot, DEPLOYMENTS, site);
const BASE = "https://localhost:8787";
/** Shown instead of the signed-in user, so the screenshots show nobody real. */
const STAND_IN = { name: "Aino Virtanen", login: "aino", initials: "AV" };

/** The pages to capture: name and app path. */
const SHOTS = [
  ["home", "/"],
  ["posts", "/posts"],
  ["editor", "/edit/content/posts/into-the-forest.md"],
  ["categories", "/categories"],
  ["media", "/media"],
] as const;

const vars = Object.fromEntries(
  readFileSync(join(dir, ".dev.vars"), "utf8")
    .split("\n")
    .map((l) => /^([A-Z_]+)=(.*)$/.exec(l.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => [m[1]!, m[2]!.replace(/^"(.*)"$/, "$1")]),
);
const gh = (...a: string[]) => execFileSync("gh", a, { encoding: "utf8" }).trim();

async function main() {
  mkdirSync(out, { recursive: true });
  const server = spawn("npm", ["run", "-s", "dev", "--", "--site", site, "--https"], { cwd: repoRoot, stdio: ["ignore", "ignore", "inherit"], detached: true });
  // The script's own requests to the local server, whose certificate is self-signed.
  const local = await request.newContext({ baseURL: BASE, ignoreHTTPSErrors: true });
  try {
    for (let i = 0; ; i++) {
      if (await local.get("/", { maxRedirects: 0 }).then(() => true, () => false)) break;
      if (i > 120) throw new Error("npm run dev didn't start");
      await new Promise((r) => setTimeout(r, 1000));
    }

    console.log("Alasin is running locally");
    // A session for the gh user, written where the local Worker reads it.
    const user = JSON.parse(gh("api", "user")) as { id: number; login: string; name: string | null };
    const config = loadAlasinConfig(join(dir, "alasin.toml"), undefined);
    const kv: [string, string][] = [];
    const env = { KV: { put: async (k: string, v: string) => void kv.push([k, v]) }, SESSION_KEY: vars.SESSION_KEY, TOKEN_KEY: vars.TOKEN_KEY };
    // Worker code: imported at run time, so the scripts' type check stays free of Worker types.
    const workerSession = "../src/worker/session";
    const { createSession } = (await import(workerSession)) as { createSession: (...a: unknown[]) => Promise<string> };
    const setCookie = await createSession(env, config, { id: user.id, login: user.login, name: user.name }, { accessToken: gh("auth", "token") });
    for (const [k, v] of kv) {
      execFileSync("npx", ["wrangler", "kv", "key", "put", k, v, "--binding", "KV", "--local", "--config", join(repoRoot, ".alasin", "wrangler.dev-default.json")], { cwd: repoRoot, stdio: "ignore", timeout: 60_000 });
    }
    console.log(`Signed in as ${user.login}`);
    const cookie = setCookie.split(";")[0]!;
    const [name, value] = cookie.split(/=(.*)/s) as [string, string];
    const me = await local.get("/api/me", { headers: { cookie } });
    if (!me.ok()) throw new Error(`The local app didn't accept the session: ${me.status()} ${(await me.text()).slice(0, 200)}`);

    for (const [device, options] of [
      // Chromium for both: WebKit refuses the Secure session cookie on http://localhost.
      ["iphone", { ...devices["iPhone 15 Pro"], defaultBrowserType: undefined }],
      ["desktop", { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }],
    ] as const) {
      const browser = await chromium.launch();
      for (const scheme of ["light", "dark"] as const) {
        // The local server's certificate is self-signed.
        // bypassCSP: the app's Content-Security-Policy would block the style that hides the badge.
        const context = await browser.newContext({ ...options, colorScheme: scheme, ignoreHTTPSErrors: true, bypassCSP: true });
        await context.addCookies([{ name, value, url: BASE, secure: true, httpOnly: true, sameSite: "Lax" }]);
        // The signed-in user's photo: a neutral one instead.
        const avatar = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#8e8e93"/><text x="32" y="41" font-family="-apple-system,Helvetica,Arial" font-size="24" fill="#fff" text-anchor="middle">${STAND_IN.initials}</text></svg>`;
        await context.route(`${BASE}/api/avatar/${user.id}*`, (route) => route.fulfill({ contentType: "image/svg+xml", body: avatar }));
        // Screenshots look like production (no DEV badge) and show nobody real (the user's name and login replaced).
        const replacements = JSON.stringify([...(user.name ? [[user.name, STAND_IN.name]] : []), [user.login, STAND_IN.login]]);
        await context.addInitScript({
          content: `addEventListener("DOMContentLoaded", () => {
            const s = document.createElement("style");
            s.textContent = ".badge-env { display: none !important; }";
            document.head.append(s);
            const pairs = ${replacements};
            const fix = (node) => {
              const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
              for (let t = walker.nextNode(); t; t = walker.nextNode()) {
                for (const [from, to] of pairs) if (t.nodeValue.includes(from)) t.nodeValue = t.nodeValue.split(from).join(to);
              }
            };
            fix(document.body);
            new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach((n) => fix(n.nodeType === 3 ? n.parentNode : n)))).observe(document.body, { childList: true, subtree: true, characterData: true });
          });`,
        });
        const page = await context.newPage();
        for (const [shot, path] of SHOTS) {
          // The app keeps polling, so the network never goes quiet: load, then give it time to fill in.
          await page.goto(BASE + path, { waitUntil: "load", timeout: 60_000 });
          await page.waitForTimeout(4000);
          const file = join(out, `${shot}-${device}-${scheme}.png`);
          await page.screenshot({ path: file });
          console.log(file);
        }
        await context.close();
      }
      await browser.close();
    }
  } finally {
    await local.dispose();
    if (server.pid) process.kill(-server.pid);
  }
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  // The local server's processes would keep Node running.
  .finally(() => process.exit());
