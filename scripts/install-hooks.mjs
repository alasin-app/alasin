// SPDX-License-Identifier: MIT
// Runs on `npm install` (the `prepare` script): points git at the repository's
// hooks in .githooks/. Does nothing outside a git checkout (e.g. in a tarball install).
import { execFileSync } from "node:child_process";

try {
  execFileSync("git", ["rev-parse", "--git-dir"], { stdio: "ignore" });
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "ignore" });
} catch {
  // Not a git checkout, or git is not installed: nothing to do.
}
