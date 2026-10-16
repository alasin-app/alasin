// SPDX-License-Identifier: MIT
// Worker entry point.

import { createApp } from "./app";
import { cleanupDrafts } from "./cleanup";
import { loadConfig } from "./config";
import type { Env } from "./env";
import { installationToken } from "./lib/installation";
import { log, logError } from "./lib/log";
import { Repo } from "./lib/repo";

export { EditLocks } from "./locks";

const app = createApp();

export default {
  fetch: app.fetch,
  // The nightly cleanup of the DRAFTS bucket (see cleanup.ts).
  async scheduled(_event, env) {
    const rid = crypto.randomUUID();
    try {
      const config = loadConfig(env.ALASIN_CONFIG_JSON);
      const { owner, repo, branch, app_id } = config.github;
      const token = await installationToken(app_id, env.GITHUB_APP_PRIVATE_KEY, owner, repo);
      const result = await cleanupDrafts(env.DRAFTS, new Repo(token, owner, repo, branch), config);
      log({ rid, event: "drafts_cleanup", folders: result.folders, removedFolders: result.removedFolders.length, removedObjects: result.removedObjects });
    } catch (err) {
      logError({ rid, event: "drafts_cleanup_failed" }, err);
    }
  },
} satisfies ExportedHandler<Env>;
