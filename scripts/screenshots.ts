// SPDX-License-Identifier: MIT
//
// npm run screenshots [-- --site <name>] [--for <name>] [--date yyyy-mm-dd] [--out <dir>] [--upload]
//
// Screenshots of the app for alasin.app (#353, #363): runs Alasin locally (npm run
// dev --https --remote-media) with a test site's configuration (default app.alasin.dev, with the
// sample content), signs in as the user `gh` is logged in as (a session made
// with their gh token, written to the local KV), and takes the same set every
// time: iPhone and desktop sizes (Chromium), light and dark, with the DEV
// badge hidden. Some show a feature the way it looks in use: the rename sheet
// in Categories, orphaned photos selected in Media, photos in the Bin, a post
// someone else is editing, and Users. Everyone in them is made up. Needs the
// site's .dev.vars (setup writes it) and the browsers (npx playwright install chromium).
//
// Each one is stored the way Alasin stores a photo for the site in --for
// (default app.alasin), so its Media lists them: a JPEG at most 1600 pixels on
// the long side under its [media] path_pattern, dated --date (default today),
// with its [images] variants next to it. The files go to --out (default
// .alasin/screenshots/) by R2 key; --upload also puts them in that site's
// media bucket, never over an existing image.

import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { chromium, devices, request, type Page, type Route } from "playwright";
import { loadAlasinConfig, readToml } from "./lib/config";
import { DEPLOYMENTS, repoRoot } from "./lib/args";
import { groupImages } from "../src/shared/media-library";

const argv = process.argv.slice(2).filter((a) => a !== "--");
const option = (name: string, fallback: string) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1]!;
};
const site = option("--site", "app.alasin.dev");
const target = option("--for", "app.alasin");
const date = option("--date", new Date().toISOString().slice(0, 10));
const out = option("--out", join(repoRoot, ".alasin", "screenshots"));
const upload = argv.includes("--upload");
const dir = join(repoRoot, DEPLOYMENTS, site);
const BASE = "https://localhost:8787";
/** The longest side of a stored screenshot: enough for a web page, like the ones taken before. */
const LONGEST = 1600;

interface Person {
  name: string;
  login: string;
  initials: string;
}
/** Shown instead of the signed-in user, so the screenshots show nobody real. */
const STAND_IN: Person = { name: "Aino Virtanen", login: "aino", initials: "AV" };
/** The other people in them, by made-up GitHub ID. */
const OTHERS: Record<number, Person> = {
  1001: { name: "Eero Laine", login: "eero", initials: "EL" },
  1002: { name: "Liisa Koskinen", login: "liisa", initials: "LK" },
};
/** The one editing the post in the "editing" screenshot. */
const EDITOR_ID = 1001;

/** What a shot needs besides its page: requests answered with made-up data, and clicks after loading. */
interface Shot {
  name: string;
  path: string;
  routes?: Record<string, (route: Route) => Promise<void>>;
  prepare?: (page: Page) => Promise<void>;
}

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const vars = Object.fromEntries(
  readFileSync(join(dir, ".dev.vars"), "utf8")
    .split("\n")
    .map((l) => /^([A-Z_]+)=(.*)$/.exec(l.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => [m[1]!, m[2]!.replace(/^"(.*)"$/, "$1")]),
);
const gh = (...a: string[]) => execFileSync("gh", a, { encoding: "utf8" }).trim();

/** The R2 key of a stored screenshot or one of its variants, by the target site's [media] and [images] settings. */
function keysFor(config: ReturnType<typeof loadAlasinConfig>, name: string) {
  const [yyyy, mm, dd] = date.split("-") as [string, string, string];
  const main = config.media.path_pattern.replace("{yyyy}", yyyy).replace("{mm}", mm).replace("{dd}", dd).replace("{name}", name).replace("{ext}", "jpg");
  const folder = main.slice(0, main.lastIndexOf("/") + 1);
  const ext = config.images.variant_format === "webp" ? "webp" : "jpg";
  const variant = (width: number) => folder + config.images.variant_name.replace("{name}", name).replace("{width}", String(width)).replace("{ext}", ext);
  return { main, variant };
}

async function main() {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`--date ${date}: use yyyy-mm-dd`);
  const config = loadAlasinConfig(join(dir, "alasin.toml"), undefined);
  const media = loadAlasinConfig(join(repoRoot, DEPLOYMENTS, target, "alasin.toml"), undefined);
  if (!media.media.path_pattern.startsWith("{yyyy}/{mm}/")) throw new Error(`${target}'s [media] path_pattern doesn't keep photos by month, so Media wouldn't list the screenshots.`);
  mkdirSync(out, { recursive: true });

  const server = spawn("npm", ["run", "-s", "dev", "--", "--site", site, "--https", "--remote-media"], { cwd: repoRoot, stdio: ["ignore", "ignore", "inherit"], detached: true });
  // The script's own requests to the local server, whose certificate is self-signed.
  const local = await request.newContext({ baseURL: BASE, ignoreHTTPSErrors: true });
  const files: { key: string; type: string }[] = [];
  try {
    for (let i = 0; ; i++) {
      if (await local.get("/", { maxRedirects: 0 }).then(() => true, () => false)) break;
      if (i > 120) throw new Error("npm run dev didn't start");
      await new Promise((r) => setTimeout(r, 1000));
    }

    console.log("Alasin is running locally");
    // A session for the gh user, written where the local Worker reads it.
    const user = JSON.parse(gh("api", "user")) as { id: number; login: string; name: string | null };
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

    // The test site's newest photos, for the Bin.
    const listing = async <T>(path: string) => (await (await local.get(path, { headers: { cookie } })).json()) as T;
    const newest = async (prefix: string): Promise<string | undefined> =>
      (await listing<{ folders: string[] }>(`/api/media/folders?prefix=${encodeURIComponent(prefix)}`)).folders.sort().at(-1);
    const year = await newest("");
    const month = year && (await newest(year));
    const photos = month ? (await listing<{ files: { key: string }[] }>(`/api/media/files?prefix=${encodeURIComponent(month)}`)).files.map((f) => f.key) : [];
    const binPhotos = groupImages(photos).slice(0, 3);
    if (!binPhotos.length) throw new Error(`${site}'s media bucket has no photos for the Bin screenshot`);

    const holder = { uid: EDITOR_ID, login: OTHERS[EDITOR_ID]!.login, name: OTHERS[EDITOR_ID]!.name, since: Date.now() - 4 * 60_000 };
    const shots: Shot[] = [
      { name: "home", path: "/" },
      { name: "posts", path: "/posts" },
      { name: "editor", path: "/edit/content/posts/into-the-forest.md" },
      { name: "categories", path: "/categories" },
      { name: "media", path: "/media" },
      {
        // 1.7.0: a subcategory's Rename or move sheet.
        name: "category-rename",
        path: "/categories",
        prepare: async (page) => {
          const sub = page.locator('button.row-check[style*="--depth: 1"]').first();
          await (await sub.count() ? sub : page.locator("button.row-check").first()).click();
          await page.getByRole("button", { name: "Rename or move" }).click();
        },
      },
      {
        // 1.4.0: orphaned photos selected for the Bin.
        name: "media-delete",
        path: "/media",
        prepare: async (page) => {
          await page.getByRole("radio", { name: "Orphaned" }).click();
          await page.getByRole("button", { name: "Select", exact: true }).click();
          // Only the months with orphaned photos open ("0 of 3": none), like the sample site's one in May.
          const months = page.locator(".media-month-header button");
          for (let i = 0; i < (await months.count()); i++) {
            const month = months.nth(i);
            const orphaned = !(await month.locator(".media-count").textContent())?.startsWith("0 ");
            if (orphaned !== ((await month.getAttribute("aria-expanded")) === "true")) await month.click();
          }
          const choices = page.locator(".media-month button.image-choice");
          await choices.first().waitFor({ timeout: 30_000 });
          for (let i = 0; i < Math.min(2, await choices.count()); i++) await choices.nth(i).click();
        },
      },
      {
        // 1.4.0: deleted photos in the Bin, from the test site's own photos.
        name: "bin",
        path: "/bin",
        routes: {
          [`${BASE}/api/media-bin`]: (route) =>
            json(route, {
              images: binPhotos.map(({ key, thumb }, i) => ({ key, thumb, deletedBy: STAND_IN.name, deletedAt: new Date(Date.now() - (i + 1) * 3_600_000).toISOString() })),
            }),
          [`${BASE}/api/media-bin/file?*`]: async (route) => {
            const key = new URL(route.request().url()).searchParams.get("key")!;
            await route.fulfill({ response: await route.fetch({ url: config.media.public_url + key }) });
          },
        },
      },
      {
        // 1.3.0: a post someone else is editing: read-only, with Take over editing.
        name: "editing",
        path: "/edit/content/posts/into-the-forest.md",
        routes: {
          [`${BASE}/api/locks/acquire`]: (route) => json(route, { error: "locked", message: "Locked", holder }, 409),
          [`${BASE}/api/locks/status?*`]: (route) => json(route, { state: "other", holder }),
        },
      },
      {
        // 1.2.0 and 1.5.0: Users, with made-up people.
        name: "users",
        path: "/users",
        routes: {
          [`${BASE}/api/users`]: async (route) => {
            const real = (await (await route.fetch()).json()) as { repository: string; branch: string };
            await json(route, {
              ...real,
              users: [
                { login: STAND_IN.login, id: user.id, name: STAND_IN.name, permission: "admin", you: true },
                ...Object.entries(OTHERS).map(([id, p]) => ({ login: p.login, id: Number(id), name: p.name, permission: "write", you: false })),
              ],
            });
          },
        },
      },
    ];

    for (const [device, options] of [
      // Chromium for both: WebKit refuses the Secure session cookie on http://localhost.
      ["iphone", { ...devices["iPhone 15 Pro"], defaultBrowserType: undefined }],
      ["desktop", { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }],
    ] as const) {
      const browser = await chromium.launch();
      // A blank page that resizes and encodes the screenshots, the way the app does in the browser.
      const encoder = await (await browser.newContext()).newPage();
      for (const scheme of ["light", "dark"] as const) {
        // The local server's certificate is self-signed.
        // bypassCSP: the app's Content-Security-Policy would block the style that hides the badge.
        const context = await browser.newContext({ ...options, colorScheme: scheme, ignoreHTTPSErrors: true, bypassCSP: true });
        await context.addCookies([{ name, value, url: BASE, secure: true, httpOnly: true, sameSite: "Lax" }]);
        // Everyone's photo: their made-up initials instead.
        await context.route(`${BASE}/api/avatar/*`, (route) => {
          const id = Number(/\/api\/avatar\/(\d+)/.exec(route.request().url())?.[1]);
          const initials = (OTHERS[id] ?? STAND_IN).initials;
          const avatar = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#8e8e93"/><text x="32" y="41" font-family="-apple-system,Helvetica,Arial" font-size="24" fill="#fff" text-anchor="middle">${initials}</text></svg>`;
          return route.fulfill({ contentType: "image/svg+xml", body: avatar });
        });
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
        for (const shot of shots) {
          for (const [url, handler] of Object.entries(shot.routes ?? {})) await page.route(url, handler);
          // The app keeps polling, so the network never goes quiet: load, then give it time to fill in.
          await page.goto(BASE + shot.path, { waitUntil: "load", timeout: 60_000 });
          await page.waitForTimeout(4000);
          if (shot.prepare) {
            await shot.prepare(page);
            // Sheets slide in.
            await page.waitForTimeout(1000);
          }
          const png = await page.screenshot();
          await page.unrouteAll({ behavior: "ignoreErrors" });
          files.push(...(await store(encoder, png, `${shot.name}-${device}-${scheme}`, media)));
        }
        await context.close();
      }
      await browser.close();
    }
  } finally {
    await local.dispose();
    if (server.pid) process.kill(-server.pid);
  }
  if (upload) uploadAll(files, media);
}

/** Resizes and encodes a screenshot into its main image and variants, writes them under --out by R2 key, and returns them. */
async function store(encoder: Page, png: Buffer, name: string, media: ReturnType<typeof loadAlasinConfig>) {
  const { main, variant } = keysFor(media, name);
  const { widths, quality, main_quality, variant_format } = media.images;
  const args = { src: `data:image/png;base64,${png.toString("base64")}`, longest: LONGEST, widths, quality, mainQuality: main_quality, type: `image/${variant_format}` };
  // Browser code, as text like the init script above, so the scripts' type check stays free of DOM types.
  const encoded = (await encoder.evaluate(`(async ({ src, longest, widths, quality, mainQuality, type }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const scale = Math.min(1, longest / Math.max(img.width, img.height));
    const encode = (width, mime, q) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = Math.round((img.height * width) / img.width);
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL(mime, q).split(",")[1];
    };
    const width = Math.round(img.width * scale);
    return {
      main: encode(width, "image/jpeg", mainQuality / 100),
      variants: widths.filter((w) => w < width).map((w) => ({ width: w, data: encode(w, type, quality / 100) })),
    };
  })(${JSON.stringify(args)})`)) as { main: string; variants: { width: number; data: string }[] };
  const written = [
    { key: main, type: "image/jpeg", data: encoded.main },
    ...encoded.variants.map((v) => ({ key: variant(v.width), type: `image/${variant_format}`, data: v.data })),
  ];
  for (const f of written) {
    const file = join(out, f.key);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, Buffer.from(f.data, "base64"));
  }
  console.log(join(out, main));
  return written.map(({ key, type }) => ({ key, type }));
}

/** Puts the files in the target site's media bucket. Like Alasin, never over an existing image: stops before any upload if one is there. */
function uploadAll(files: { key: string; type: string }[], media: ReturnType<typeof loadAlasinConfig>) {
  const wrangler = readToml(join(repoRoot, DEPLOYMENTS, target, "wrangler.toml")) as { r2_buckets?: { binding: string; bucket_name: string; jurisdiction?: string }[] };
  const binding = wrangler.r2_buckets?.find((b) => b.binding === "MEDIA");
  const bucket = binding?.bucket_name;
  if (!bucket) throw new Error(`No MEDIA bucket in ${target}'s wrangler.toml`);
  const taken = files.filter((f) => {
    try {
      execFileSync("curl", ["-fsI", media.media.public_url + f.key], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  });
  if (taken.length) throw new Error(`Already in ${bucket}, so nothing was uploaded: ${taken.map((f) => f.key).join(", ")}. Take them with another --date.`);
  for (const f of files) {
    execFileSync(
      "npx",
      ["wrangler", "r2", "object", "put", `${bucket}/${f.key}`, "--file", join(out, f.key), "--content-type", f.type, "--cache-control", media.media.cache_control, ...(binding.jurisdiction ? ["--jurisdiction", binding.jurisdiction] : []), "--remote"],
      { cwd: repoRoot, stdio: "ignore", timeout: 120_000 },
    );
    console.log(`Uploaded ${f.key}`);
  }
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  // The local server's processes would keep Node running.
  .finally(() => process.exit());
