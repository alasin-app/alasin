# Alasin

Alasin (Finnish for "anvil") is a web app for writing and publishing pages and posts on a **Hugo site stored in GitHub, hosted on Cloudflare, with images in R2**. It's built for a small group of people who write together and want something as easy as a hosted CMS, especially on iPhone and iPad, without leaving their own Hugo, GitHub and Cloudflare setup.

> **Status: early development.** Login with GitHub, sessions, security headers, the app shell and the setup tooling work. The editor, image upload and publishing are being built; see the milestones in the project's issues. The configuration format may still change before 1.0.

## Features

- Login with GitHub only (a GitHub App, with an allowlist of GitHub user IDs); commits are made as the person who wrote them
- iOS-style app that works on iPhone, iPad and any modern desktop browser, in light and dark mode, in English and Finnish
- Runs on the Cloudflare Workers Free plan: one Worker with static assets, R2 for images, KV for sessions, a Durable Object for edit locks
- Uses your site's existing conventions (content folders, image bucket layout, gallery shortcode, image sizes) through configuration
- Drafts of posts and pages, saved in the site repository; photos resized in the browser (with WebP sizes, GPS removed) and uploaded to a private R2 bucket; galleries with the site's own shortcode
- A live-formatting editor on the Markdown itself (formatted text, inline images with their texts, gallery cards you can add photos to, line breaks shown) with a switch to the raw Markdown; posts change only where you edit them
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

Alasin logs users in with a **GitHub App** installed only on the site repository (the app itself is public, so that everyone with write access to the repository can sign in): it's used for login, for commits made with each user's own short-lived token, and for the daily cleanup's read-only token. Unlike an OAuth App, it can be limited to one repository and to exactly the permissions Alasin needs.

`npm run setup` normally creates it. If that isn't possible, create it under **Settings → Developer settings → GitHub Apps → New GitHub App** (for an organisation: the organisation's **Settings → Developer settings**):

- **GitHub App name:** anything unique, e.g. "Alasin my-site".
- **Homepage URL:** the app URL, e.g. `https://alasin.example.com`.
- **Callback URL:** `https://<app hostname>/auth/callback`. It must match `[app] url` in `alasin.toml` exactly. Add `http://localhost:8787/auth/callback` too if you'll develop locally.
- **Expire user authorization tokens:** on.
- **Request user authorization (OAuth) during installation:** off.
- **Webhook:** uncheck **Active**.
- **Repository permissions:** **Contents: Read and write**, **Metadata: Read-only**. Nothing else.
- **Where can this GitHub App be installed?** **Any account**. With *Only on this account*, GitHub shows everyone except the app's owner a 404 page instead of the sign-in, so nobody else could log in. Making it public is safe: Alasin lets in only people with write access to the site repository (everyone else's sign-in is refused and their token revoked), and the app can reach only the repositories it's installed on — install it only on the site repository.

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

### Check your existing posts first

Before editing existing posts and pages with Alasin, check that it keeps them exactly as they are. With a checkout of your site repository:

```sh
npm run roundtrip -- ../my-hugo-site            # content directory "content"
npm run roundtrip -- ../my-hugo-site site/content
```

It opens every Markdown file with the editor's own code and saves it without changes, in memory only. Every file must come back byte for byte; any that doesn't is listed with the first line that would change. Please report those as issues.

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
| `author_field` | string | — | — | Front matter field for the author's name: new posts and pages get the user's full name from their GitHub profile, and the lists show who wrote each one. Leave unset if the site doesn't use one. |
| `author_id_field` | string | `"author_id"` | `"author_id"` | With `author_field` set: front matter field for the author's GitHub login, which identifies the author (names can change). Alasin shows the author's current GitHub name for it, and writes that name to `author_field` on saving, so that field keeps the last known name. |
| `lastmod_field` | string | `"lastmod"` | `"lastmod"` | Front matter field set to the current time whenever a post or page is published or saved. `""` turns it off. |
| `post_url` | string | — | — | If set, the `url` front matter field of published posts follows this pattern, e.g. `/{yyyy}/{mm}/{dd}/{slug}/`. Placeholders: `{slug}`, `{yyyy}`, `{mm}`, `{dd}` (the post date). Set on publishing, and updated when the address or date of a published post is changed. Leave unset if the site uses Hugo's permalinks instead. |
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

The site's existing public image bucket (`MEDIA` binding). Alasin never overwrites or deletes objects there.

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
| `url_pattern` | string | — | — | If set, new categories get a `url` field following this pattern, e.g. `/category/{path}/`. Placeholders: `{slug}`, `{path}` (the slugs from the top-level category down to this one, joined with /). Leave unset if the site's permalinks are enough. |

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
npm run setup      # updates alasin.toml (see below)
npm run deploy
```

`npm run setup` keeps an existing `alasin.toml` in step with `alasin.example.toml`: it updates options that were renamed or removed, and adds sections and options that are new in this version, with their comments, set to their default values (or commented out), so new options are visible without changing what your configuration does. Everything else in the file, including your comments, stays as it is. It lists every change it makes. Add `-- --env <name>` for a second deployment.

## Users and access

**Everyone with write access to the site repository on GitHub can use the deployment** (write, maintain or admin). Alasin asks GitHub at every login and again about once an hour during a session, so you manage people in one place, on GitHub:

- **Add someone:** invite them to the site repository with **Write** access (the repository's **Settings → Collaborators → Add people**). Once they accept, they open the app's address and sign in with GitHub. With `[site] author_field` set, their posts get their GitHub login in `author_id` and their full name from their GitHub profile in `author` (see *Authors* below).
- **Remove someone:** remove them from the repository's collaborators (or lower them to *Read*). They're logged out within the hour.
- **Check:** the app's **Users** section (in the sidebar; on phones under *More*) lists everyone who can log in, with their permission on the repository.

Nothing in `alasin.toml` changes and nothing needs deploying. Two more things:

- **The GitHub App must be public** (*Where can this GitHub App be installed?* → *Any account*; for an existing app, its settings → *Advanced* → *Make public*). GitHub shows a private app to nobody but its owner, so nobody else could even sign in. Making it public lets nobody else in: anyone without write access is refused and their token revoked, and the app reaches only the repositories it's installed on.
- **A protected branch:** if `[github] branch` has rules that stop some writers from pushing, their saves fail with GitHub's message. Give them the right on GitHub, or use another branch.

## Authors

With `[site] author_field` set, each post and page records who wrote it in two front matter fields:

```yaml
author: "Octo Cat"     # the name, as last written
author_id: "octocat"   # the GitHub login: who wrote it
```

- **`author_id` identifies the author** (`[site] author_id_field`, default `author_id`). Profile names can change at any time; the login is what Alasin matches avatars, *My drafts*, *My recent posts* and the author filter on. It can be written by hand too.
- **`author` is the name as last written.** The lists and the editor show the author's current GitHub name for their `author_id`, and saving a post writes that name to `author`. Someone who no longer has access keeps the name their posts last had. A post without `author_id` (e.g. by someone without a GitHub account) is shown by its `author` text; choose *Someone else* in the editor's author picker to write a name only.
- **Names are never kept:** Alasin reads them from GitHub every time, so a changed name shows at once.

**Existing posts:** posts written before `author_id` need it added once (for example with a small script that maps each `author` name to a login), so Alasin knows whose they are. Until then they are matched by name.

### Showing authors on the site (optional)

Hugo can show the current GitHub name for `author_id` too. A partial such as `layouts/partials/author.html`:

```go-html-template
{{- $name := .Params.author -}}
{{- with .Params.author_id -}}
  {{- $opts := dict -}}
  {{- with os.Getenv "HUGO_GITHUB_TOKEN" }}{{ $opts = dict "headers" (dict "Authorization" (printf "Bearer %s" .)) }}{{ end -}}
  {{- with try (resources.GetRemote (printf "https://api.github.com/users/%s" .) $opts) -}}
    {{- with .Value }}{{ with . | transform.Unmarshal }}{{ $name = or .name .login $name }}{{ end }}{{ end -}}
  {{- end -}}
{{- end -}}
{{ $name }}
```

It never fails the build: if GitHub doesn't answer, it shows `author`. So that names aren't kept between builds, turn Hugo's download cache off in the site configuration:

```toml
[caches.getresource]
maxAge = 0
```

Without a token GitHub allows 60 requests an hour, so set `HUGO_GITHUB_TOKEN` in the build environment (any token; it needs no permissions). A changed name shows on the site after the next build.

## Housekeeping

Secrets are rotated by hand, and Alasin reminds you when it's time. `npm run setup` records in `alasin.toml` when each secret was last rotated (`[security] session_keys_rotated`, `github_secrets_rotated`). Once `[security] rotation_reminder_days` (default 180) have passed, `npm run deploy` prints a reminder with the exact steps, and the app's account sheet shows a *Housekeeping* section.

| Task | How often | How |
| --- | --- | --- |
| Rotate the session and token keys | when reminded | `npm run setup -- --rotate-keys` (everyone has to log in again) |
| Rotate the GitHub App's client secret and private key | when reminded | see *Rotating secrets* below |
| Update Alasin | when a release appears | see [Updating](#updating) |
| Remove photos of drafts that no longer exist from the `DRAFTS` bucket | nightly, automatic | a Cron Trigger (`[drafts] cleanup_cron`, 03:17 UTC by default) with a read-only installation token of the GitHub App; waits `[drafts] cleanup_after_days` (7) and deletes nothing if the repository can't be read. Shows as `drafts_cleanup` in the Worker's logs |
| Review who may log in | now and then | the site repository's collaborators on GitHub; see [Users and access](#users-and-access) |

## Security

- **Login:** GitHub App OAuth with PKCE and a single-use `state`. Only people with write access to the site repository can log in; it's confirmed with GitHub at login and about once an hour.
- **Sessions:** an encrypted, `HttpOnly`, `Secure`, `SameSite=Lax` `__Host-` cookie that refers to a server-side session in KV. Idle and absolute timeouts; logout deletes the session server-side.
- **Tokens:** GitHub tokens never reach the browser. They are stored encrypted (AES-GCM) in KV and refreshed before expiry.
- **Browser:** a strict Content-Security-Policy (no inline or third-party scripts, no `eval`; WebAssembly is allowed only for the bundled WebP encoder, needed because iOS browsers can't encode WebP), CSRF protection on every state-changing request, HSTS and other security headers. No analytics or trackers.
- **Data:** drafts, archived items and the Bin are folders of the site repository (`drafts/`, `archive/`, `bin/`; keep it private). The app deletes posts, pages and drafts from the repository only when the Bin is emptied; the one other deletion is a category's term page, when the category is deleted in *Categories* (after a confirmation that names how many posts use it). Images never go into git: draft images are in a private R2 bucket, published images in your public bucket, where the app never overwrites or deletes anything.
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
