// SPDX-License-Identifier: MIT
// A new site's alasin.toml and wrangler.toml, from the example files and what
// create-site knows: the repository, the buckets, the site's and media's
// addresses, and Alasin's Worker names, for production and [env.dev] (or dev
// alone; a test site is production with the DEV badge). npm run setup then does the rest (GitHub App, KV, secrets, domain).
//
// No file access here, so tests can use it.

import { parse } from "smol-toml";
import type { Item, SiteState } from "./create-site";
import { setValue } from "./toml-edit";
import { type Bucket, envWranglerSection } from "./wrangler-env";

const origin = (url: string) => url.replace(/\/+$/, "");

export function siteConfigFor(
  state: SiteState,
  items: Item[],
  opts: { alasinExample: string; wranglerExample: string; devAppUrl?: string },
): { alasin: string; wrangler: string } {
  const prod = state.environments.includes("production");
  const dev = state.environments.includes("dev");
  const item = (slot: Item["slot"]) => items.find((i) => i.slot === slot);
  const bucket = (slot: Item["slot"]): Bucket => {
    const i = item(slot);
    if (!i) throw new Error(`No ${slot} bucket in the plan`);
    const j = (i.jurisdiction ?? state.jurisdiction) || undefined;
    return { name: i.name, ...(j ? { jurisdiction: j } : {}) };
  };
  if (dev && (!state.devSiteUrl || !state.devMediaUrl || !opts.devAppUrl)) throw new Error("The dev site's, media's and app's addresses must be known first");
  if (prod && (!state.domains.app || !state.domains.site || !state.domains.media)) throw new Error("Production's domains are missing");

  // The base tables are production, or dev when there's only dev.
  const base = prod
    ? { app: `https://${state.domains.app}`, branch: "main", site: `https://${state.domains.site}`, media: `https://${state.domains.media}/`, label: state.test ? "DEV" : "" }
    : { app: origin(opts.devAppUrl!), branch: "dev", site: origin(state.devSiteUrl!), media: state.devMediaUrl!, label: "DEV" };

  let alasin = opts.alasinExample;
  alasin = setValue(alasin, "[app]", "url", base.app);
  alasin = setValue(alasin, "[github]", "owner", state.owner);
  alasin = setValue(alasin, "[github]", "repo", state.repo);
  alasin = setValue(alasin, "[github]", "branch", base.branch);
  alasin = setValue(alasin, "[site]", "url", base.site);
  alasin = setValue(alasin, "[media]", "public_url", base.media);
  if (base.label) alasin = setValue(alasin, "[ui]", "environment_label", base.label);
  if (prod && dev) {
    alasin = setValue(alasin, "[env.dev.app]", "url", origin(opts.devAppUrl!));
    alasin = setValue(alasin, "[env.dev.github]", "branch", "dev");
    // Dev has its own GitHub App (an app has one login callback): the example's placeholders, which
    // setup treats as not set yet, so dev doesn't inherit production's app and installation.
    alasin = setValue(alasin, "[env.dev.github]", "app_id", 123456);
    alasin = setValue(alasin, "[env.dev.github]", "client_id", "Iv23liAbCdEfGhIjKlMn");
    alasin = setValue(alasin, "[env.dev.github]", "installation_id", 12345678);
    alasin = setValue(alasin, "[env.dev.site]", "url", origin(state.devSiteUrl!));
    alasin = setValue(alasin, "[env.dev.media]", "public_url", state.devMediaUrl!);
    alasin = setValue(alasin, "[env.dev.ui]", "environment_label", "DEV");
  }

  const env = prod ? "production" : "dev";
  let wrangler = opts.wranglerExample;
  wrangler = setValue(wrangler, "", "name", item(`alasin:${env}`)!.name);
  for (const [binding, slot] of [
    ["MEDIA", `media:${env}`],
    ["DRAFTS", `drafts:${env}`],
  ] as const) {
    const b = bucket(slot);
    wrangler = setValue(wrangler, "[[r2_buckets]]", "bucket_name", b.name, { where: { key: "binding", value: binding } });
    if (b.jurisdiction) wrangler = setValue(wrangler, "[[r2_buckets]]", "jurisdiction", b.jurisdiction, { where: { key: "binding", value: binding } });
  }
  if (prod && dev) {
    const section = envWranglerSection("dev", parse(wrangler) as Record<string, unknown>, {
      worker: item("alasin:dev")!.name,
      buckets: { media: bucket("media:dev"), drafts: bucket("drafts:dev") },
    });
    wrangler = `${wrangler.replace(/\n*$/, "\n")}\n${section.replace("added by npm run setup -- --env dev", "added by npm run create-site")}`;
  }
  return { alasin, wrangler };
}
