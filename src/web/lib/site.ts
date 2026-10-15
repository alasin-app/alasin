// SPDX-License-Identifier: MIT
// Site settings for the editor (GET /api/site), loaded once per app session.

import { api } from "./api";
import type { SiteSettings } from "./site-types";

export type { SiteSettings };


let cached: Promise<SiteSettings> | undefined;

export function loadSite(): Promise<SiteSettings> {
  cached ??= api<SiteSettings>("/api/site").catch((err: unknown) => {
    cached = undefined;
    throw err;
  });
  return cached;
}
