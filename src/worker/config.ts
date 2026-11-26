// SPDX-License-Identifier: MIT
// The Worker's configuration: the deployment's sites (alasin.toml and
// sites/*.toml), validated by `npm run build|dev|deploy` and compiled into the
// script as __ALASIN_CONFIG_JSON__ (not a variable: Cloudflare limits those to
// 5.1 kB, #432). Tests, built with it empty, pass theirs as the
// ALASIN_CONFIG_JSON binding instead. Re-validated once per isolate.

import { type Deployment, parseDeployment } from "../shared/config/deployment";

let cached: { raw: string; deployment: Deployment } | undefined;

/** `override` is the ALASIN_CONFIG_JSON binding, used only when nothing is compiled in (tests). */
export function loadDeployment(override?: string): Deployment {
  const raw = __ALASIN_CONFIG_JSON__ || override;
  if (cached && cached.raw === raw) return cached.deployment;
  if (!raw) throw new Error("Alasin's configuration is missing; deploy with `npm run deploy`, not `wrangler deploy`");
  const deployment = parseDeployment(raw);
  cached = { raw, deployment };
  return deployment;
}
