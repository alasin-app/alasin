// SPDX-License-Identifier: MIT
// The Worker's configuration: the deployment's sites (alasin.toml and
// sites/*.toml), validated by `npm run build|dev|deploy` and injected as the
// ALASIN_CONFIG_JSON variable. Re-validated once per isolate.

import { type Deployment, parseDeployment } from "../shared/config/deployment";

let cached: { raw: string; deployment: Deployment } | undefined;

export function loadDeployment(raw: string | undefined): Deployment {
  if (cached && cached.raw === raw) return cached.deployment;
  if (!raw) throw new Error("ALASIN_CONFIG_JSON is not set; deploy with `npm run deploy`, not `wrangler deploy`");
  const deployment = parseDeployment(raw);
  cached = { raw, deployment };
  return deployment;
}
