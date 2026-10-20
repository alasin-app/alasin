Every option of `alasin.toml`, the site's Alasin settings (see [Configuration Files](Configuration-Files.md) for where it lives). The commented [`alasin.example.toml`](https://github.com/alasin-app/alasin/blob/main/alasin.example.toml) explains each one in more detail; Worker bindings and rate limits are in [`wrangler.example.toml`](https://github.com/alasin-app/alasin/blob/main/wrangler.example.toml).

After changing `alasin.toml`, deploy again: `npm run deploy -- --site <site>`. When a release renames or adds options, `npm run setup` updates the file (see [Updating](Updating.md)).

<!-- config-reference:start -->

### `[app]`

The Alasin deployment itself.

| Option | Type | Default | Example | Description |
| --- | --- | --- | --- | --- |
| `url` | string (URL) | **required** | `"https://alasin.example.com"` | Canonical public origin of this Alasin deployment. Used for the OAuth callback (`<url>/auth/callback`, which must match the GitHub App), the CSRF `Origin` check and redirects from other hostnames. |

### `[site]`

The Hugo site and its content layout.

| Option | Type | Default | Example | Description |
| --- | --- | --- | --- | --- |
| `url` | string (URL) | **required** | `"https://www.example.com"` | Public URL of the Hugo site for the configured branch, used for “View on site” links. |
| `posts_dir` | string | `"content/posts"` | `"content/posts"` | Directory of posts in the site repository. |
| `pages_dir` | string | `"content/pages"` | `"content/pages"` | Directory of pages in the site repository. |
| `post_filename` | string | `"{slug}.md"` | `"{yyyy}/{slug}.md"` | File name pattern for new posts, relative to `posts_dir`. Placeholders: `{slug}`, `{yyyy}`, `{mm}`, `{dd}`. Must end in `.md`. |
| `page_filename` | string | `"{slug}.md"` | `"{slug}.md"` | File name pattern for new pages, relative to `pages_dir`. Placeholder: `{slug}`. Must end in `.md`. |
| `cover_field` | string | `"image"` | `"image"` | Front matter field holding a post's cover image. |
| `author_field` | string | `"author"` | `"author"` | Front matter field for the author's name, as last written: new posts and pages get the user's full name from their GitHub profile. |
| `author_id_field` | string | `"author_id"` | `"author_id"` | Front matter field for the author's GitHub login, which identifies the author (names can change). Alasin shows the author's current GitHub name for it, and writes that name to `author_field` on saving, so that field keeps the last known name. |
| `lastmod_field` | string | `"lastmod"` | `"lastmod"` | Front matter field set to the current time whenever a post or page is published or saved. `""` turns it off. |
| `post_url` | string | — | `"/{yyyy}/{mm}/{dd}/{slug}/"` | If set, the `url` front matter field of published posts follows this pattern, e.g. `/{yyyy}/{mm}/{dd}/{slug}/`. Placeholders: `{slug}`, `{yyyy}`, `{mm}`, `{dd}` (the post date). Set on publishing, and updated when the address or date of a published post is changed. Leave unset if the site uses Hugo's permalinks instead. |
| `page_url` | string | — | — | Like `post_url`, for pages, e.g. `/{slug}/`. |
| `front_matter_format` | one of "yaml", "toml" | `"yaml"` | `"yaml"` | Front matter format for new files. Existing files keep the format they already use. |

### `[github]`

The site repository and the GitHub App used to log in. Secrets go in Worker secrets, never here.

| Option | Type | Default | Example | Description |
| --- | --- | --- | --- | --- |
| `owner` | string | **required** | `"octocat"` | Owner (user or organisation) of the site repository. |
| `repo` | string | **required** | `"my-hugo-site"` | Name of the site repository. |
| `branch` | string | `"main"` | `"main"` | Branch Alasin reads from and commits to. |
| `app_id` | integer | **required** | `123456` | ID of the GitHub App used for login. Filled in by `npm run setup`. |
| `client_id` | string | **required** | `"Iv23liAbCdEfGhIjKlMn"` | Client ID of the GitHub App. Filled in by `npm run setup`. |
| `installation_id` | integer | — | — | Installation ID of the GitHub App on the site repository, used by the daily cleanup. Filled in by `npm run setup`. |

### `[media]`

The site's existing public image bucket (`MEDIA` binding). Alasin never overwrites objects there; an image leaves it only when it's deleted in *Media* (orphaned images only), into the Bin.

| Option | Type | Default | Example | Description |
| --- | --- | --- | --- | --- |
| `public_url` | string (URL) | **required** | `"https://media.example.com/"` | Public base URL of the `MEDIA` bucket, ending in `/`. Its origin is added to the Content-Security-Policy. |
| `path_pattern` | string | `"{yyyy}/{mm}/{dd}/{name}.{ext}"` | `"{yyyy}/{mm}/{dd}/{name}.{ext}"` | R2 key pattern for published images. Placeholders: `{yyyy}`, `{mm}`, `{dd}` (from the post date), `{name}` (the original file name, lower-cased and URL-safe; `-2`, `-3`… is added only if that name is already taken), `{ext}` (from the image type). Must match the bucket's existing layout. The media library lists images by month when it starts with `{yyyy}/{mm}/`. |
| `content_prefix` | string | `"/img/"` | `"/img/"` | How Markdown refers to published images: this prefix followed by the R2 key. Use the site's own convention, e.g. `/img/` when a render hook maps it to the media domain, or the full `public_url`. |
| `cache_control` | string | `"public, max-age=604800"` | `"public, max-age=604800"` | `Cache-Control` header set on images copied to `MEDIA`. |
| `browse_prefixes` | array of string | `[""]` | `[""]` | Top-level prefixes of `MEDIA` the media library may list. `""` means the bucket root. |

### `[drafts]`

Unpublished drafts: their text is committed to the site repository, their images go to R2.

| Option | Type | Default | Example | Description |
| --- | --- | --- | --- | --- |
| `dir` | string | `"drafts"` | `"drafts"` | Directory in the site repository where draft posts and pages are committed until they are published. Must be outside Hugo's content directory, so drafts are never built. Draft images go to the `DRAFTS` R2 bucket, never into git. |
| `cleanup_after_days` | integer | `7` | `7` | The nightly cleanup removes a draft's photos from the `DRAFTS` bucket when no draft with that ID exists in the repository (drafts folder or Bin) and nothing in its folder changed for this many days, which protects drafts that exist only on someone's device and editing sessions in progress. |
| `cleanup_cron` | string | `"17 3 * * *"` | `"17 3 * * *"` | When the nightly cleanup runs: a cron expression in UTC (Cloudflare Cron Triggers). |

### `[archive]`

Archived posts and pages: off the site, kept in the site repository.

| Option | Type | Default | Example | Description |
| --- | --- | --- | --- | --- |
| `dir` | string | `"archive"` | `"archive"` | Directory in the site repository for archived posts and pages: taken off the site but kept, and can be republished. Each keeps its repository path under this directory (e.g. `archive/content/posts/…`). Must be outside Hugo's content directory. |

### `[bin]`

The Bin: deleted posts, pages and drafts stay here, recoverable, until the Bin is emptied.

| Option | Type | Default | Example | Description |
| --- | --- | --- | --- | --- |
| `dir` | string | `"bin"` | `"bin"` | Directory in the site repository for deleted items until the Bin is emptied. Each keeps the path it was deleted from, so it can be recovered to exactly that place. Must be outside Hugo's content directory. Alasin deletes files from the repository only inside this directory. |

### `[images]`

Automatic resizing in the browser.

| Option | Type | Default | Example | Description |
| --- | --- | --- | --- | --- |
| `accepted_types` | array of one of "image/jpeg", "image/png", "image/webp", "image/gif" | `["image/jpeg", "image/png", "image/webp", "image/gif"]` | `["image/jpeg", "image/png", "image/webp", "image/gif"]` | Image types users may upload. SVG is never accepted. HEIC is converted in the browser. |
| `max_upload_mb` | number | `25` | `25` | Maximum size of one uploaded file, in MB. |
| `site_config_file` | string | — | — | TOML file in the site repository that defines image sizes, shared with the site's own tooling, e.g. `config/_default/params.toml`. Values found there override the ones below. |
| `widths_key` | string | `"imageWidths"` | `"imageWidths"` | Key in `site_config_file` holding the variant widths. |
| `quality_key` | string | `"imageQuality"` | `"imageQuality"` | Key in `site_config_file` holding the variant quality. |
| `max_size_key` | string | `"imageMaxSize"` | `"imageMaxSize"` | Key in `site_config_file` holding the main image's longest side. |
| `widths` | array of integer | `[480, 960, 1600]` | `[480, 960, 1600]` | Widths of the resized variants, in pixels. |
| `variant_format` | one of "webp", "jpeg" | `"webp"` | `"webp"` | Format of the resized variants. |
| `variant_name` | string | `"{name}-{width}.{ext}"` | `"{name}-{width}.{ext}"` | File name of each variant, next to the main image. Placeholders: `{name}`, `{width}`, `{ext}`. |
| `quality` | number | `80` | `80` | Encoding quality of the variants (1–100). |
| `max_size` | integer | `2560` | `2560` | Longest side of the main image, in pixels. |
| `main_quality` | number | `85` | `85` | JPEG quality of the main image (1–100). |
| `keep_exif` | boolean | `false` | `false` | Keep EXIF metadata (camera, date) in the main image. GPS location is always removed. |

### `[editor]`

Editor behaviour.

| Option | Type | Default | Example | Description |
| --- | --- | --- | --- | --- |
| `lock_heartbeat_seconds` | integer | `60` | `60` | How often an open editor renews its lock. |
| `lock_expiry_seconds` | integer | `180` | `180` | How long a lock lasts without renewal (closed tab, lost connection). Must be longer than the heartbeat. |
| `gallery_shortcode` | string | `"gallery"` | `"gallery"` | Name of the site's gallery shortcode. |
| `gallery_paired` | boolean | `true` | `true` | `true` if the gallery wraps Markdown images (`{{< gallery >}} … {{< /gallery >}}`). |

### `[categories]`

Categories. With `term-pages`, they can be added and deleted in the app.

| Option | Type | Default | Example | Description |
| --- | --- | --- | --- | --- |
| `storage` | one of "term-pages", "data-file", "front-matter" | `"term-pages"` | `"term-pages"` | Where the category list lives: `term-pages` (`<dir>/<slug>/_index.md`), `data-file` (a TOML/YAML file listing them) or `front-matter` (only the values used in posts). |
| `path` | string | `"content/categories"` | `"content/categories"` | Directory of term pages, or path of the data file. |
| `parent_field` | string | `"parent"` | `"parent"` | Field naming a category's parent category (by slug), in its term page's front matter or its data file entry. Categories without it are top-level. |
| `url_pattern` | string | — | — | If set, new, renamed and moved categories get a `url` field following this pattern (a changed address keeps the old one in `aliases`), e.g. `/category/{path}/`. Placeholders: `{slug}`, `{path}` (the slugs from the top-level category down to this one, joined with /). Leave unset if the site's permalinks are enough. |

### `[preview]`

Preview styling.

| Option | Type | Default | Example | Description |
| --- | --- | --- | --- | --- |
| `css_url` | string (URL) | — | — | Stylesheet of the site's theme used in the preview. Its origin is allowed by the CSP. |

### `[ui]`

What users see.

| Option | Type | Default | Example | Description |
| --- | --- | --- | --- | --- |
| `name` | string | `"Alasin"` | `"Alasin"` | App name shown to users. |
| `accent_color` | string | `"#007AFF"` | `"#007AFF"` | Accent colour as `#rrggbb`. Defaults to iOS system blue. |
| `environment_label` | string | — | — | Badge shown in the app for non-production deployments, e.g. `DEV`. Leave unset in production. |
| `default_language` | one of "en", "fi" | `"en"` | `"en"` | Default UI language. Users can change it in the app. |

### `[security]`

Sessions and secret rotation reminders. Rate limits are set in `wrangler.toml` (`[[ratelimits]]`).

| Option | Type | Default | Example | Description |
| --- | --- | --- | --- | --- |
| `session_idle_days` | number | `7` | `7` | Log out after this many days without activity. |
| `session_max_days` | number | `30` | `30` | Log out this many days after login, regardless of activity. |
| `rotation_reminder_days` | integer | `180` | `180` | Remind (in `npm run deploy` and the app's account sheet) to rotate secrets this many days after they were last rotated. |
| `session_keys_rotated` | string | — | — | Date the session and token encryption keys were last rotated, `YYYY-MM-DD`. Written by `npm run setup`. |
| `github_secrets_rotated` | string | — | — | Date the GitHub App's client secret and private key were last rotated, `YYYY-MM-DD`. Written by `npm run setup`. |

<!-- config-reference:end -->
