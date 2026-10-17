// SPDX-License-Identifier: MIT
//
// npm run roundtrip -- <site checkout> [content dir]
//
// Opens every Markdown file under the site's content directory with the
// editor's own code and saves it without changes: every file must come back
// byte for byte. Run it against your site before editing existing posts with
// Alasin. Reads only; nothing is written.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { roundTrip } from "../src/web/lib/round-trip";
import type { SiteSettings } from "../src/web/lib/site-types";

const [siteDir = ".", contentDir = "content"] = process.argv.slice(2).filter((a) => a !== "--");
const root = join(siteDir, contentDir);

// Only what reading and saving use; the rest doesn't affect a file saved unchanged.
const site = { frontMatterFormat: "yaml", coverField: "image", authorField: "author", authorIdField: "author_id", author: null, login: "", users: [], categories: [] } as unknown as SiteSettings;

const files: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith(".md")) files.push(path);
  }
};
try {
  walk(root);
} catch {
  console.error(`No content directory at ${root}. Usage: npm run roundtrip -- <site checkout> [content dir]`);
  process.exit(2);
}

let failed = 0;
for (const file of files) {
  const result = roundTrip(readFileSync(file, "utf8"), site);
  if (result.ok) continue;
  failed++;
  console.log(`✗ ${relative(siteDir, file)}${result.line ? `:${result.line}` : ""} — ${result.reason}`);
  if (result.before !== undefined || result.after !== undefined) {
    console.log(`    before: ${JSON.stringify(result.before)}`);
    console.log(`    after:  ${JSON.stringify(result.after)}`);
  }
}
console.log(`${files.length - failed} of ${files.length} files saved unchanged.`);
process.exit(failed ? 1 : 0);
