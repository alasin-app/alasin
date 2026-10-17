// SPDX-License-Identifier: MIT
//
// GET /api/site — what the editor needs to know about the site: categories,
// image settings (from the site's own config file when configured), the
// gallery shortcode, time zone and front matter conventions, and the signed-in
// user's author name. Read from the repository on each request, so it follows
// changes made outside Alasin. Names come live from GitHub profiles.

import { Hono } from "hono";
import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";
import type { Category } from "../../shared/categories";
import { parseFields, splitFrontMatter } from "../../shared/frontmatter";
import type { AppEnv } from "../app";
import { members } from "../lib/access";
import { profileNames } from "../lib/profile-names";
import { readFolderTexts, Repo } from "../lib/repo";
import { getUserToken } from "../session";


export const site = new Hono<AppEnv>();

function asNumberList(v: unknown): number[] | undefined {
  return Array.isArray(v) && v.every((x) => Number.isInteger(x) && x > 0) ? (v as number[]) : undefined;
}

site.get("/", async (c) => {
  const config = c.get("config");
  const token = await getUserToken(c);
  const { owner, repo: name, branch } = config.github;
  const repo = new Repo(token, owner, name, branch);

  // Categories.
  let categories: Category[] = [];
  const cat = config.categories;
  if (cat.storage === "term-pages") {
    for (const f of await readFolderTexts(token, owner, name, branch, cat.path)) {
      const m = /^([^/]+)\/_index\.md$/.exec(f.path);
      if (!m) continue;
      const split = splitFrontMatter(f.text);
      const fields = split ? parseFields(split.format, split.raw) : new Map();
      const title = fields.get("title");
      const parent = fields.get(cat.parent_field);
      categories.push({
        slug: m[1]!,
        title: typeof title === "string" && title ? title : m[1]!,
        ...(typeof parent === "string" && parent ? { parent } : {}),
      });
    }
  } else if (cat.storage === "data-file") {
    const file = await repo.getFile(cat.path);
    if (file) {
      const data: unknown = cat.path.endsWith(".toml") ? parseToml(file.content) : parseYaml(file.content);
      const list = Array.isArray(data) ? data : data && typeof data === "object" ? Object.entries(data).map(([slug, title]) => ({ slug, title })) : [];
      categories = list
        .map((x): Category => {
          if (typeof x === "string") return { slug: x, title: x };
          const parent = x[cat.parent_field];
          return { slug: String(x.slug ?? ""), title: String(x.title ?? x.slug ?? ""), ...(typeof parent === "string" && parent ? { parent } : {}) };
        })
        .filter((x) => x.slug);
    }
  }
  categories.sort((a, b) => a.title.localeCompare(b.title));

  // Image settings: alasin.toml, overridden by the site's own config file.
  const img = config.images;
  const images = { widths: img.widths, quality: img.quality, maxSize: img.max_size };
  if (img.site_config_file) {
    const file = await repo.getFile(img.site_config_file);
    if (file) {
      const params = parseToml(file.content) as Record<string, unknown>;
      images.widths = asNumberList(params[img.widths_key]) ?? images.widths;
      if (typeof params[img.quality_key] === "number") images.quality = params[img.quality_key] as number;
      if (typeof params[img.max_size_key] === "number") images.maxSize = params[img.max_size_key] as number;
    }
  }

  const session = c.get("session");
  // Who can log in (the list, or the repository's writers), with full names from GitHub profiles.
  const people = await members(c.env.KV, token, config);
  const names = await profileNames(token, [...new Set([session.uid, ...people.map((u) => u.id)])]);
  const fullName = (u: { id: number }) => names.get(u.id) ?? (u.id === session.uid ? session.name : null);
  return c.json({
    frontMatterFormat: config.site.front_matter_format,
    coverField: config.site.cover_field,
    authorField: config.site.author_field,
    authorIdField: config.site.author_id_field,
    author: fullName({ id: session.uid }) ?? session.login,
    login: session.login,
    // Who each author_id (GitHub login) is, with their current name, for the lists and the editor.
    users: people.map((u) => ({ login: u.login, id: u.id, name: fullName(u) })),
    categories,
    /** Whether categories can be added and deleted in the app (term pages only). */
    categoriesEditable: config.categories.storage === "term-pages",
    gallery: { shortcode: config.editor.gallery_shortcode, paired: config.editor.gallery_paired },
    locks: { heartbeatSeconds: config.editor.lock_heartbeat_seconds, expirySeconds: config.editor.lock_expiry_seconds },
    media: {
      publicUrl: config.media.public_url,
      contentPrefix: config.media.content_prefix,
      browse: config.media.browse_prefixes,
      /** Whether published images are in year and month folders, as the media library shows them. */
      byMonth: config.media.path_pattern.startsWith("{yyyy}/{mm}/"),
    },
    folders: {
      posts: config.site.posts_dir,
      pages: config.site.pages_dir,
      drafts: config.drafts.dir,
      archive: config.archive.dir,
      bin: config.bin.dir,
    },
    images: {
      ...images,
      mainQuality: img.main_quality,
      variantFormat: img.variant_format,
      variantName: img.variant_name,
      keepExif: img.keep_exif,
      acceptedTypes: img.accepted_types,
      maxUploadMb: img.max_upload_mb,
    },
    lock: { heartbeatSeconds: config.editor.lock_heartbeat_seconds, expirySeconds: config.editor.lock_expiry_seconds },
  });
});
