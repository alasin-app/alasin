// SPDX-License-Identifier: MIT
//
// npm run skeleton:check
//
// Builds the skeleton site (templates/site/) the way create-site will set it
// up: a copy with the placeholders filled, plus test content using every
// Alasin feature (test/fixtures/site-check/), built with the Hugo version the
// skeleton pins. Then checks that covers, images, galleries, YouTube,
// categories and sub-pages came out right. A second build uses the dev site's
// sample content (templates/sample/) instead. Needs Go (Hugo modules) and
// network access for the theme. Run in CI, so a theme or Hugo update that
// breaks the skeleton is caught.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { repoRoot } from "./lib/args";
import { creditsPage } from "./lib/sample-content";
import { fillPlaceholders, PLACEHOLDER_FILES, unfilled } from "./lib/skeleton";

const values = {
  SITE_URL: "https://www.example.com",
  SITE_TITLE: "Example",
  LANGUAGE: "en",
  MEDIA_URL: "https://media.example.com/",
  DEV_MEDIA_URL: "https://pub-0123.r2.dev/",
  SITE_WORKER: "example-com",
  MODULE_PATH: "github.com/octocat/example.com",
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const failures: string[] = [];
const expect = (ok: boolean, what: string) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures.push(what);
};

const dir = mkdtempSync(join(tmpdir(), "alasin-skeleton-"));
try {
  cpSync(join(repoRoot, "templates", "site"), dir, { recursive: true });
  for (const file of PLACEHOLDER_FILES) {
    const path = join(dir, file);
    writeFileSync(path, fillPlaceholders(readFileSync(path, "utf8"), values));
  }
  // Every placeholder is in a file create-site fills.
  for (const path of files(dir)) {
    const left = unfilled(readFileSync(path, "utf8"));
    expect(!left.length, `no placeholders left in ${relative(dir, path)}${left.length ? `: ${left.join(", ")}` : ""}`);
  }
  cpSync(join(repoRoot, "test", "fixtures", "site-check", "content"), join(dir, "content"), { recursive: true });

  // As in a build of its own: none of the npm settings this script was started with (npm_config_*).
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^npm_(config|package|lifecycle)_/i.test(k)));
  const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { cwd: dir, env, stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" });
  run("npm", ["ci", "--no-audit", "--no-fund"]);
  const log = run(join(dir, "node_modules", ".bin", "hugo"), ["--gc", "--minify", "--logLevel", "warn"]);
  console.log(log.trim());

  const page = (path: string) => (existsSync(join(dir, "public", path)) ? readFileSync(join(dir, "public", path), "utf8") : "");
  const post = page("posts/first-trip/index.html");
  expect(!!page("index.html"), "home page");
  expect(post.includes("entry-cover") && post.includes("src=https://media.example.com/2026/10/01/cover.jpg"), "cover from the image field, at the media URL");
  expect(page("posts/index.html").includes("https://media.example.com/2026/10/01/cover.jpg"), "cover in the post list");
  expect(post.includes("src=https://media.example.com/2026/10/01/lake.jpg"), "inline image at the media URL");
  expect(post.includes("<figcaption>The forest at dawn</figcaption>"), "image title as caption");
  expect((post.match(/alasin-gallery-item/g) ?? []).length === 3, "gallery of three linked thumbnails");
  expect(post.includes("href=https://other.example.com/c.jpg"), "image from elsewhere left as it is");
  expect(/youtube(-nocookie)?\.com\/embed\/aqz-KE-bpKQ/.test(post), "YouTube embed");
  expect(post.includes("Jane Doe"), "author");
  expect(!!page("categories/travel/index.html") && !!page("tags/gallery/index.html"), "category and tag pages");
  expect(page("pages/about/index.html").includes("Team") && !!page("pages/about/team/index.html"), "page with a sub-page");
  expect(!existsSync(join(dir, "public", "drafts")) && !existsSync(join(dir, "public", "bin")), "drafts and Bin not built");

  // The dev site's sample content, filled in as create-site will.
  rmSync(join(dir, "content"), { recursive: true });
  rmSync(join(dir, "public"), { recursive: true });
  cpSync(join(repoRoot, "templates", "site", "content"), join(dir, "content"), { recursive: true });
  const sample = join(repoRoot, "templates", "sample", "repo");
  const sampleValues = { SITE_TITLE: "Example", AUTHOR_NAME: "Jane Doe", AUTHOR_ID: "jane-doe", SECOND_AUTHOR_NAME: "John Roe", SECOND_AUTHOR_ID: "john-roe" };
  for (const path of files(sample)) {
    const target = join(dir, relative(sample, path));
    cpSync(path, target);
    writeFileSync(target, fillPlaceholders(readFileSync(target, "utf8"), sampleValues));
  }
  const credits = creditsPage(readFileSync(join(repoRoot, "templates", "sample", "CREDITS.md"), "utf8"));
  writeFileSync(join(dir, credits.path), credits.text);
  console.log(run(join(dir, "node_modules", ".bin", "hugo"), ["--gc", "--minify", "--logLevel", "warn"]).trim());

  const posts = page("posts/index.html");
  expect(["spring-blossoms", "lakes-of-the-north", "into-the-forest", "along-the-coast", "dry-valleys"].every((s) => !!page(`posts/${s}/index.html`)), "sample: five posts");
  expect(posts.includes("https://media.example.com/2026/09/28/dry-valley.jpg"), "sample: covers in the post list");
  expect(page("index.html").includes("https://media.example.com/2026/07/02/fell-lake.jpg"), "sample: home page cover");
  expect(page("posts/lakes-of-the-north/index.html").includes("John Roe"), "sample: second author");
  expect(!!page("pages/about/team/index.html") && !!page("pages/about/history/index.html"), "sample: page with two sub-pages");
  expect(page("pages/credits/index.html").includes("apple-blossoms.jpg"), "sample: credits page");
  expect(!!page("categories/forests/index.html") && !!page("categories/coast/index.html"), "sample: category pages");
  expect(!page("posts/shallow-water/index.html") && !page("posts/an-older-trip/index.html") && !page("posts/a-deleted-post/index.html"), "sample: drafts, archive and Bin not on the site");

  // A preview build (the dev site): the dev media bucket, root-relative links.
  rmSync(join(dir, "public"), { recursive: true });
  // As scripts/build.sh builds it.
  run(join(dir, "node_modules", ".bin", "hugo"), ["--gc", "--logLevel", "error", "--baseURL", "/", "--environment", "preview"]);
  expect(page("posts/dry-valleys/index.html").includes('src="https://pub-0123.r2.dev/2026/09/28/dry-valley.jpg"'), "preview build: photos from the dev media bucket");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log("\nThe skeleton builds.");
