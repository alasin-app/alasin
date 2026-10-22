// SPDX-License-Identifier: MIT
//
// npm run sites
//
// Lists the deployments in deployments/ (one folder each, untracked): the
// site repository, or each site in sites/, and for each environment the
// Alasin Worker and app URL.
// Read from each alasin.toml and wrangler.toml as written, without validating
// them, so a half-finished setup is listed too.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEPLOYMENTS, listDeployments, repoRoot } from "./lib/args";
import { parse } from "smol-toml";
import { describeDeployment } from "./lib/sites";

function readToml(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    return parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}


function main() {
  const sites = listDeployments();
  if (!sites.length) {
    console.log(`No deployments in ${DEPLOYMENTS}/. Use npm run setup -- --site <site repository name> to start one.`);
    return;
  }
  for (const site of sites) {
    const dir = join(repoRoot, DEPLOYMENTS, site);
    console.log(`${site}${existsSync(join(dir, "site", ".git")) ? "  (site clone in site/)" : ""}`);
    const sitesDir = join(dir, "sites");
    const sites = existsSync(sitesDir)
      ? Object.fromEntries(
          readdirSync(sitesDir)
            .filter((f) => f.endsWith(".toml"))
            .sort()
            .map((f) => [f.slice(0, -".toml".length), readToml(join(sitesDir, f))]),
        )
      : null;
    for (const line of describeDeployment(readToml(join(dir, "alasin.toml")), readToml(join(dir, "wrangler.toml")), sites)) console.log(line);
  }
}

main();
