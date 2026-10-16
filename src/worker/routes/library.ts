// SPDX-License-Identifier: MIT
//
// Browsing the public MEDIA bucket (read only), a level at a time so a large
// library is never listed at once. Media is only added from a post or page;
// here it can be found and reused.
//
//   GET /api/media/folders?prefix=   sub-folders of a folder (e.g. "" → years, "2026/" → months)
//   GET /api/media/files?prefix=&cursor=   images in a folder, up to 1000 per page
//   GET /api/media/year?prefix=2026/   a year's images by month (keys only, variants grouped),
//                                      so every month can show its count before it's opened
//
// Prefixes are limited to `[media] browse_prefixes`.

import { Hono } from "hono";
import type { AlasinConfig } from "../../shared/config/schema";
import { groupImages, type LibraryImage } from "../../shared/media-library";
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

/** A year beyond this many list pages (1000 keys each) is listed a month at a time instead. */
const YEAR_PAGES = 50;

library.get("/year", async (c) => {
  const prefix = c.req.query("prefix") ?? "";
  if (!/(?:^|\/)\d{4}\/$/.test(prefix) || !safe(prefix) || !inside(c.get("config"), prefix)) return c.json({ error: "invalid", message: "Not a year folder." }, 400);
  const keys: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; ; page++) {
    if (page === YEAR_PAGES) return c.json({ prefix, months: null });
    const listed = await c.env.MEDIA.list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    keys.push(...listed.objects.map((o) => o.key).filter((k) => IMAGE.test(k)));
    if (!listed.truncated) break;
    cursor = listed.cursor;
  }
  const months: Record<string, LibraryImage[]> = {};
  for (const img of groupImages(keys)) {
    const month = /^(\d{2})\//.exec(img.key.slice(prefix.length))?.[1];
    if (month) (months[`${prefix}${month}/`] ??= []).push(img);
  }
  return c.json({ prefix, months });
});
