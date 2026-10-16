// SPDX-License-Identifier: MIT
//
// Browsing the public MEDIA bucket (read only), a level at a time so a large
// library is never listed at once. Media is only added from a post or page;
// here it can be found and reused.
//
//   GET /api/media/folders?prefix=   sub-folders of a folder (e.g. "" → years, "2026/" → months)
//   GET /api/media/files?prefix=&cursor=   images in a folder, up to 1000 per page
//
// Prefixes are limited to `[media] browse_prefixes`.

import { Hono } from "hono";
import type { AlasinConfig } from "../../shared/config/schema";
import type { AppEnv } from "../app";

const IMAGE = /\.(jpe?g|png|webp|gif|avif)$/i;

const safe = (prefix: string) => prefix.length <= 512 && !prefix.includes("..") && !prefix.startsWith("/") && /^[A-Za-z0-9._/-]*$/.test(prefix);

/** Inside one of the browse prefixes. */
const inside = (config: AlasinConfig, key: string) => config.media.browse_prefixes.some((p) => key.startsWith(p));

/** On the way to one of them (or inside one): folders that may be listed. */
const towards = (config: AlasinConfig, prefix: string) => inside(config, prefix) || config.media.browse_prefixes.some((p) => p.startsWith(prefix));

export const library = new Hono<AppEnv>();

library.get("/folders", async (c) => {
  const prefix = c.req.query("prefix") ?? "";
  const config = c.get("config");
  if (!safe(prefix) || !towards(config, prefix)) return c.json({ error: "invalid", message: "Not a media folder." }, 400);
  const folders: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await c.env.MEDIA.list({ prefix, delimiter: "/", limit: 1000, ...(cursor ? { cursor } : {}) });
    folders.push(...page.delimitedPrefixes.filter((f) => towards(config, f)));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor && folders.length < 5000);
  return c.json({ prefix, folders });
});

library.get("/files", async (c) => {
  const prefix = c.req.query("prefix") ?? "";
  const cursor = c.req.query("cursor") || undefined;
  if (!prefix || !safe(prefix) || !inside(c.get("config"), prefix)) return c.json({ error: "invalid", message: "Not a media folder." }, 400);
  const page = await c.env.MEDIA.list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
  const files = page.objects.filter((o) => IMAGE.test(o.key)).map((o) => ({ key: o.key, size: o.size, uploaded: o.uploaded.toISOString() }));
  return c.json({ prefix, files, cursor: page.truncated ? page.cursor : null });
});
