// SPDX-License-Identifier: MIT
// The Worker's configuration: alasin.toml, validated by `npm run build|dev|deploy`
// and injected as the ALASIN_CONFIG_JSON variable. Re-validated once per isolate.

import { parseConfig, type AlasinConfig } from "../shared/config/schema";

let cached: { raw: string; config: AlasinConfig } | undefined;

export function loadConfig(raw: string | undefined): AlasinConfig {
  if (cached && cached.raw === raw) return cached.config;
  if (!raw) throw new Error("ALASIN_CONFIG_JSON is not set; deploy with `npm run deploy`, not `wrangler deploy`");
  const config = parseConfig(JSON.parse(raw), "ALASIN_CONFIG_JSON");
  cached = { raw, config };
  return config;
}

/** Whether `[users] allow` lets this user in (no list: everyone with write access to the repository). */
export function isAllowed(config: AlasinConfig, userId: number): boolean {
  return !config.users.allow || config.users.allow.some((u) => u.id === userId);
}
