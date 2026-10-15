#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// Blocks deployment-specific terms from reaching the repository.
//
// Terms come from the gitignored file `.local/denylist` (one per line, `#`
// comments allowed, matched case-insensitively). Without that file the check
// passes, so contributors who have no private deployment are not affected.
// Independently of the denylist, it always fails if a path under `.local/` is
// staged or tracked.
//
//   --staged          staged file names and contents (pre-commit hook)
//   --message <file>  a commit message (commit-msg hook)
//   --tracked         every tracked or addable file in the working tree (npm run lint)
//   --history         every commit message and file version in the history
//   --text <file>     any text file, e.g. a PR description

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = git(["rev-parse", "--show-toplevel"]).trim();
const denylistPath = join(root, ".local", "denylist");
const terms = existsSync(denylistPath)
  ? readFileSync(denylistPath, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
  : [];
const lowerTerms = terms.map((t) => t.toLowerCase());

const findings = [];

function git(args, opts = {}) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 30, ...opts });
}

function gitBuffer(args) {
  return execFileSync("git", args, { maxBuffer: 1 << 30 });
}

function isBinary(buf) {
  return buf.subarray(0, 8000).includes(0);
}

function scanText(label, text) {
  if (lowerTerms.length === 0) return;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    for (let t = 0; t < lowerTerms.length; t++) {
      if (line.includes(lowerTerms[t])) findings.push(`${label}:${i + 1}: contains denylisted term "${terms[t]}"`);
    }
  }
}

function scanBlob(label, buf) {
  scanText(`${label} (name)`, label);
  if (!isBinary(buf)) scanText(label, buf.toString("utf8"));
  else if (lowerTerms.length) {
    // Binary files (images, fonts): still catch ASCII metadata such as EXIF or PNG text chunks.
    scanText(label, buf.toString("latin1"));
  }
}

function checkLocalPath(path) {
  if (path === ".local" || path.startsWith(".local/")) findings.push(`${path}: files under .local/ must never be committed`);
}

const [mode, arg] = process.argv.slice(2);

switch (mode) {
  case "--staged": {
    const files = git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]).split("\0").filter(Boolean);
    for (const f of files) {
      checkLocalPath(f);
      scanBlob(f, gitBuffer(["show", `:${f}`]));
    }
    break;
  }
  case "--message":
  case "--text": {
    if (!arg) throw new Error(`${mode} needs a file path`);
    scanText(mode === "--message" ? "commit message" : arg, readFileSync(arg, "utf8"));
    break;
  }
  case "--tracked": {
    const files = git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean);
    for (const f of files) {
      checkLocalPath(f);
      if (existsSync(join(root, f))) scanBlob(f, readFileSync(join(root, f)));
    }
    const tracked = git(["ls-files", "-z"]).split("\0").filter(Boolean);
    for (const f of tracked) checkLocalPath(f);
    break;
  }
  case "--history": {
    const commits = git(["rev-list", "--all"]).split("\n").filter(Boolean);
    for (const c of commits) {
      scanText(`commit ${c.slice(0, 12)} message`, git(["log", "-1", "--format=%B", c]));
      const entries = git(["ls-tree", "-r", "-z", c]).split("\0").filter(Boolean);
      for (const e of entries) {
        const [meta, path] = e.split("\t");
        const sha = meta.split(" ")[2];
        checkLocalPath(path);
        scanBlob(`${c.slice(0, 12)}:${path}`, gitBuffer(["cat-file", "blob", sha]));
      }
    }
    for (const ref of git(["for-each-ref", "--format=%(refname)"]).split("\n").filter(Boolean)) scanText("ref", ref);
    break;
  }
  default:
    console.error("usage: denylist-check.mjs --staged | --message <file> | --tracked | --history | --text <file>");
    process.exit(2);
}

const unique = [...new Set(findings)];
if (unique.length) {
  console.error("Denylist check failed — deployment-specific data must not enter the Alasin repository:");
  for (const f of unique.slice(0, 50)) console.error(`  ${f}`);
  if (unique.length > 50) console.error(`  … and ${unique.length - 50} more`);
  process.exit(1);
}
if (!terms.length && mode !== "--staged" && mode !== "--message") {
  console.log("denylist: .local/denylist not found, only the .local/ path check ran");
}
