// SPDX-License-Identifier: MIT
// What `npm run build|dev|deploy` adds to the Worker's Wrangler configuration
// for a deployment, apart from the entry point and assets. Kept free of
// node:fs so it can be tested in the Workers runtime.

import { type Deployment, serializeDeployment } from "../../src/shared/config/deployment";

export interface ManagedSettings {
  triggers: { crons: string[] };
  define: { __ALASIN_VERSION__: string; __ALASIN_CONFIG_JSON__: string };
}

export function managedSettings(deployment: Deployment, version: string): ManagedSettings {
  return {
    // The nightly cleanup of each site's DRAFTS bucket.
    triggers: { crons: [...new Set(deployment.sites.map((s) => s.config.drafts.cleanup_cron))] },
    define: {
      __ALASIN_VERSION__: JSON.stringify(version),
      // The validated sites are compiled into the script rather than passed as
      // a text variable: Cloudflare limits a text binding to 5.1 kB, which a
      // few sites' configurations exceed (#432). The script's limit is MBs.
      __ALASIN_CONFIG_JSON__: JSON.stringify(serializeDeployment(deployment)),
    },
  };
}
