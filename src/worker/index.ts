// SPDX-License-Identifier: MIT
// Worker entry point.

import { createApp } from "./app";
import { cleanupDrafts } from "./cleanup";
import { loadDeployment } from "./config";
import type { Env } from "./env";
import { installationToken } from "./lib/installation";
import { log, logError } from "./lib/log";
import { Repo } from "./lib/repo";

export { EditLocks } from "./locks";

const app = createApp();

export default {
  fetch: app.fetch,
  // The nightly cleanup of each site's DRAFTS bucket (see cleanup.ts): the sites whose cleanup_cron this is.
  async scheduled(event, env) {
    const rid = crypto.randomUUID();
    let sites;
    try {
      sites = loadDeployment(env.ALASIN_CONFIG_JSON).sites;
    } catch (err) {
      logError({ rid, event: "drafts_cleanup_failed" }, err);
      return;
    }
    for (const site of sites.filter((s, _, all) => all.length === 1 || s.config.drafts.cleanup_cron === event.cron)) {
      try {
        const { owner, repo, branch, app_id } = site.config.github;
        const token = await installationToken(app_id, env.GITHUB_APP_PRIVATE_KEY, owner, repo);
        const drafts = env[site.drafts] as R2Bucket | undefined;
        if (!drafts) throw new Error(`no ${site.drafts} binding`);
        const result = await cleanupDrafts(drafts, new Repo(token, owner, repo, branch), site.config);
        log({ rid, event: "drafts_cleanup", site: site.id, folders: result.folders, removedFolders: result.removedFolders.length, removedObjects: result.removedObjects });
      } catch (err) {
        logError({ rid, event: "drafts_cleanup_failed", site: site.id }, err);
      }
    }
  },
} satisfies ExportedHandler<Env>;
