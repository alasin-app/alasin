# Alasin

Alasin (Finnish for "anvil") is a web app for writing and publishing pages and posts on a **Hugo site stored in GitHub, hosted on Cloudflare, with images in R2**. It's built for a small group of people who write together and want something as easy as a hosted CMS, especially on iPhone and iPad, without leaving their own Hugo, GitHub and Cloudflare setup.

> **Status: early development.** Login with GitHub, sessions, security headers, the app shell and the setup tooling work. The editor, image upload and publishing are being built; see the milestones in the project's issues. The configuration format may still change before 1.0.

## Features

- Login with GitHub only (a GitHub App, with an allowlist of GitHub user IDs); commits are made as the person who wrote them
- iOS-style app that works on iPhone, iPad and any modern desktop browser, in light and dark mode, in English and Finnish
- Runs on the Cloudflare Workers Free plan: one Worker with static assets, R2 for images, KV for sessions, a Durable Object for edit locks
- Uses your site's existing conventions (content folders, image bucket layout, gallery shortcode, image sizes) through configuration
- Drafts of posts and pages, saved in the site repository; photos resized in the browser (with WebP sizes, GPS removed) and uploaded to a private R2 bucket; galleries with the site's own shortcode
- A live-formatting editor on the Markdown itself (formatted text, inline images, gallery cards, line breaks shown) with a switch to the raw Markdown; posts change only where you edit them
- Coming next: publishing, editing existing posts, edit locks

## Requirements

- A Hugo site in a GitHub repository (private recommended), deployed by Cloudflare
- A Cloudflare account with R2 enabled, and the site's images in an R2 bucket
- Node.js LTS (22 or newer) and npm. Wrangler, Cloudflare's CLI, comes with the project.

Prepare your Cloudflare and GitHub accounts first: **[PREREQUISITES.md](PREREQUISITES.md)**.

## Installation

Starting from a state where everything in [PREREQUISITES.md](PREREQUISITES.md) is done:

1. Clone and install:

   ```sh
   git clone https://github.com/oh2th/alasin.git
   cd alasin
   npm install
   ```

2. Log in to Cloudflare: `npx wrangler login`. Approve access in the browser window that opens; when the terminal prints `Successfully logged in.`, close the browser tab (details in [PREREQUISITES.md §3](PREREQUISITES.md#3-wrangler-connection)).

3. Run the setup:

   ```sh
   npm run setup
   ```

   It asks for the values in the [PREREQUISITES.md checklist](PREREQUISITES.md#5-checklist), then:

   - creates `alasin.toml` and `wrangler.toml` from the commented examples;
   - looks up the GitHub IDs of the people allowed to log in;
   - creates the private `DRAFTS` R2 bucket for images of unpublished drafts (suggested name: your media bucket's name + `-drafts`; every deployment needs its own), in the same jurisdiction as your media bucket, and the KV namespace for sessions;
   - creates the **GitHub App** used to log in and to commit as each user. Your browser opens:
     1. on a short local page, click **Continue to GitHub**;
     2. on GitHub, check the app name and click **Create GitHub App**;
     3. on the install page that opens next, choose **Only select repositories**, pick the site repository, click **Install**, and return to the terminal;
   - stores the GitHub App's credentials and newly generated encryption keys as Worker secrets.

   It's safe to re-run: finished steps are skipped. If the GitHub App can't be created this way, see [Creating the GitHub App manually](#creating-the-github-app-manually).

   Optionally, give the GitHub App a logo: on its settings page under **Display information → Upload a logo**, use [`icons/alasin-logo-512.png`](icons/alasin-logo-512.png), or [`icons/alasin-logo-512-dev.png`](icons/alasin-logo-512-dev.png) for a dev deployment.

4. Deploy:

   ```sh
   npm run deploy
   ```

5. Open the app URL, log in with GitHub, and check that your name and avatar appear in the account sheet (tap your avatar).

### Creating the GitHub App manually

Alasin logs users in with a **GitHub App** installed only on the site repository: it's used for login, for commits made with each user's own short-lived token, and for the daily cleanup's read-only token. Unlike an OAuth App, it can be limited to one repository and to exactly the permissions Alasin needs.

`npm run setup` normally creates it. If that isn't possible, create it under **Settings → Developer settings → GitHub Apps → New GitHub App** (for an organisation: the organisation's **Settings → Developer settings**):

- **GitHub App name:** anything unique, e.g. "Alasin my-site".
- **Homepage URL:** the app URL, e.g. `https://alasin.example.com`.
- **Callback URL:** `https://<app hostname>/auth/callback`. It must match `[app] url` in `alasin.toml` exactly. Add `http://localhost:8787/auth/callback` too if you'll develop locally.
- **Expire user authorization tokens:** on.
- **Request user authorization (OAuth) during installation:** off.
- **Webhook:** uncheck **Active**.
- **Repository permissions:** **Contents: Read and write**, **Metadata: Read-only**. Nothing else.
- **Where can this GitHub App be installed?** **Only on this account**.

Create it, then:

1. **Install App** → **Only select repositories** → the site repository → **Install**.
2. On the app's page, note the **App ID** and **Client ID**, click **Generate a new client secret**, and under **Private keys** click **Generate a private key** (a `.pem` file downloads).
3. Run `npm run setup` and answer **no** when it offers to create the app. It asks for these values, converts the key and stores everything as Worker secrets. Secrets never go in TOML files or git.

### Keeping a deployment's configuration in its own repository

`alasin.toml`, `wrangler.toml` and `.dev.vars` are gitignored. To keep them under version control, put them in a separate **private** repository and point every command at it:

```sh
ALASIN_CONFIG=../my-site-alasin/alasin.toml npm run setup
ALASIN_CONFIG=../my-site-alasin/alasin.toml npm run deploy
# or: npm run deploy -- --config ../my-site-alasin/alasin.toml
```

`wrangler.toml` is looked up next to that `alasin.toml` (override with `--wrangler-config` or `WRANGLER_CONFIG`).

### Production and dev deployments

You can run a second, separate deployment — for example a dev app that commits to the site's `dev` branch — next to production:

```sh
npm run setup  -- --env dev
npm run deploy -- --env dev
```

Each environment is its own Worker with its own URL, `DRAFTS` bucket, KV namespace, Durable Object, rate limits, secrets and (recommended) its own GitHub App. Settings that differ go in an `[env.dev]` table in `alasin.toml` and `wrangler.toml`; setup adds them. A dev deployment shows a badge (e.g. "DEV") everywhere in the app. Workers preview URLs aren't used for this, because they share production's bindings and secrets.

## Configuration reference

Every option of `alasin.toml`. The commented [`alasin.example.toml`](alasin.example.toml) explains each one in more detail; Worker bindings and rate limits are in [`wrangler.example.toml`](wrangler.example.toml).

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
| `post_filename` | string | `"{slug}.md"` | `"{slug}.md"` | File name pattern for new posts, relative to `posts_dir`. Placeholders: `{slug}`, `{yyyy}`, `{mm}`, `{dd}`. Must end in `.md`. |
| `page_filename` | string | `"{slug}.md"` | `"{slug}.md"` | File name pattern for new pages, relative to `pages_dir`. Placeholder: `{slug}`. Must end in `.md`. |
| `cover_field` | string | `"image"` | `"image"` | Front matter field holding a post's cover image. |
| `author_field` | string | — | — | Front matter field for the author's name (from `[users] allow` `author`). Leave unset if the site doesn't use one. |
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

### `[users]`

Who may log in.

| Option | Type | Default | Example | Description |
| --- | --- | --- | --- | --- |
| `allow` | array of { login, id, author } | **required** | `[{"login" = "octocat", "id" = 583231}]` | GitHub users allowed to log in. `npm run setup` resolves usernames to numeric IDs. |

### `[media]`

The site's existing public image bucket (`MEDIA` binding). Alasin never overwrites or deletes objects there.

| Option | Type | Default | Example | Description |
| --- | --- | --- | --- | --- |
| `public_url` | string (URL) | **required** | `"https://media.example.com/"` | Public base URL of the `MEDIA` bucket, ending in `/`. Its origin is added to the Content-Security-Policy. |
| `path_pattern` | string | `"{yyyy}/{mm}/{dd}/{name}.{ext}"` | `"{yyyy}/{mm}/{dd}/{name}.{ext}"` | R2 key pattern for published images. Placeholders: `{yyyy}`, `{mm}`, `{dd}` (from the post date), `{name}` (the original file name, lower-cased and URL-safe; `-2`, `-3`… is added only if that name is already taken), `{ext}` (from the image type). Must match the bucket's existing layout. |
| `content_prefix` | string | `"/img/"` | `"/img/"` | How Markdown refers to published images: this prefix followed by the R2 key. Use the site's own convention, e.g. `/img/` when a render hook maps it to the media domain, or the full `public_url`. |
| `cache_control` | string | `"public, max-age=604800"` | `"public, max-age=604800"` | `Cache-Control` header set on images copied to `MEDIA`. |
| `browse_prefixes` | array of string | `[""]` | `[""]` | Top-level prefixes of `MEDIA` the media browser may list. `""` means the bucket root. |

### `[drafts]`

Unpublished drafts: their text is committed to the site repository, their images go to R2.

| Option | Type | Default | Example | Description |
| --- | --- | --- | --- | --- |
| `dir` | string | `"drafts"` | `"drafts"` | Directory in the site repository where draft posts and pages are committed until they are published. Must be outside Hugo's content directory, so drafts are never built. Draft images go to the `DRAFTS` R2 bucket, never into git. |

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

Categories.

| Option | Type | Default | Example | Description |
| --- | --- | --- | --- | --- |
| `storage` | one of "term-pages", "data-file", "front-matter" | `"term-pages"` | `"term-pages"` | Where the category list lives: `term-pages` (`<dir>/<slug>/_index.md`), `data-file` (a TOML/YAML file listing them) or `front-matter` (only the values used in posts). |
| `path` | string | `"content/categories"` | `"content/categories"` | Directory of term pages, or path of the data file. |

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

## Updating

Read the release notes first and follow any upgrade steps they list. Then:

```sh
git fetch --tags
git checkout vX.Y.Z
npm install
npm run setup      # updates alasin.toml if options were renamed or removed
npm run deploy
```

## Housekeeping

Secrets are rotated by hand, and Alasin reminds you when it's time. `npm run setup` records in `alasin.toml` when each secret was last rotated (`[security] session_keys_rotated`, `github_secrets_rotated`). Once `[security] rotation_reminder_days` (default 180) have passed, `npm run deploy` prints a reminder with the exact steps, and the app's account sheet shows a *Housekeeping* section.

| Task | How often | How |
| --- | --- | --- |
| Rotate the session and token keys | when reminded | `npm run setup -- --rotate-keys` (everyone has to log in again) |
| Rotate the GitHub App's client secret and private key | when reminded | see *Rotating secrets* below |
| Update Alasin | when a release appears | see [Updating](#updating) |
| Review who may log in | now and then | `[users] allow` in `alasin.toml`, then `npm run deploy` |

## Security

- **Login:** GitHub App OAuth with PKCE and a single-use `state`. Only GitHub user IDs listed in `[users]` can log in, re-checked on every request.
- **Sessions:** an encrypted, `HttpOnly`, `Secure`, `SameSite=Lax` `__Host-` cookie that refers to a server-side session in KV. Idle and absolute timeouts; logout deletes the session server-side.
- **Tokens:** GitHub tokens never reach the browser. They are stored encrypted (AES-GCM) in KV and refreshed before expiry.
- **Browser:** a strict Content-Security-Policy (no inline or third-party scripts, no `eval`; WebAssembly is allowed only for the bundled WebP encoder, needed because iOS browsers can't encode WebP), CSRF protection on every state-changing request, HSTS and other security headers. No analytics or trackers.
- **Data:** drafts are committed to a `drafts/` folder of the site repository (keep it private). Images never go into git: draft images are in a private R2 bucket, published images in your public bucket, where the app never overwrites or deletes anything.
- **Logs** contain request IDs, routes, status codes and GitHub user IDs only.

**Rotating secrets** (per deployment; add `-- --env dev` for the dev app):

| Secret | How to rotate | Effect |
| --- | --- | --- |
| `SESSION_KEY`, `TOKEN_KEY` | `npm run setup -- --rotate-keys` | Everyone has to log in again |
| `GITHUB_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY` | On the GitHub App's settings page, generate a new client secret and a new private key; run `npm run setup -- --rotate-github` and enter them; then delete the old ones on GitHub | None |

Pass `--config <path to wrangler.toml>` to `wrangler secret put` if your configuration lives outside this repository.

Report vulnerabilities as described in [SECURITY.md](SECURITY.md).

## Local development

```sh
npm install
npm run dev        # http://localhost:8787, with local R2, KV and Durable Objects
npm test           # Worker tests in the Workers runtime (Miniflare)
npm run lint
npm run typecheck
```

`npm run dev` needs a `.dev.vars` file next to your `wrangler.toml` with `SESSION_KEY`, `TOKEN_KEY`, `GITHUB_CLIENT_SECRET` and `GITHUB_APP_PRIVATE_KEY` (setup can write it), and `http://localhost:8787/auth/callback` among the GitHub App's callback URLs.

## Licence

[MIT](LICENSE). Runtime dependencies: [Hono](https://hono.dev) (MIT), [Zod](https://zod.dev) (MIT), [smol-toml](https://github.com/squirrelchat/smol-toml) (BSD-3-Clause), [Preact](https://preactjs.com) (MIT), [Lucide](https://lucide.dev) (ISC).
