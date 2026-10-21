For working on Alasin itself. How changes are named, reviewed and released, and what must never be committed, is in [CONTRIBUTING.md](https://github.com/alasin-app/alasin/blob/main/CONTRIBUTING.md).

## Setup

You need the tools in [Before You Start](Before-You-Start.md), step 1. Then:

```sh
git clone https://github.com/alasin-app/alasin.git
cd alasin
npm install        # also installs the git hooks (.githooks/)
npm test           # Worker tests in the Workers runtime (Miniflare)
npm run lint
npm run typecheck
```

`npm run skeleton:check`, which builds the site skeleton, also needs [Go](https://go.dev/dl/); see [Testing](Testing.md).

## Running Alasin locally

```sh
npm run dev -- --site <site> --env dev    # http://localhost:8787, with local R2, KV and Durable Objects
```

It runs with a deployment's configuration and signs in with its GitHub App, usually a [test environment](Test-Environment.md)'s (`--env dev`; leave it out for a deployment without environments). That deployment needs:

- `http://localhost:8787/auth/callback` among the GitHub App's callback URLs: answer **Y** to setup's *Also allow logins from local development?*.
- A `.dev.vars.dev` file (`.dev.vars` without `--env`) next to the deployment's `wrangler.toml`, with `SESSION_KEY`, `TOKEN_KEY`, `GITHUB_CLIENT_SECRET` and `GITHUB_APP_PRIVATE_KEY`: answer **Y** to setup's *Write … .dev.vars for local development?*. It's the only secret file in `deployments/`; never commit or share it.

Setup can be run again on an existing deployment to change these answers: `npm run setup -- --site <site> --env dev`.

## Code

| Path | What it is |
| --- | --- |
| `src/worker/` | The API: a Cloudflare Worker (Hono) with the edit-lock Durable Object and the nightly cleanup |
| `src/web/` | The app (Preact), served as the Worker's static assets |
| `src/shared/` | The configuration schema and helpers used by both |
| `scripts/` | `setup`, `deploy`, `create-site` and the other npm commands |
| `templates/site/` | The skeleton Hugo site that `create-site` writes, on the PaperMod theme |
| `templates/sample/` | The test environment's sample content: `repo/`, laid out as in the site repository, with `__NAME__` placeholders for the site title and the two authors, and its photos in `images/`, credited in `CREDITS.md` |
| `wiki/` | This documentation (see [CONTRIBUTING.md](https://github.com/alasin-app/alasin/blob/main/CONTRIBUTING.md#documentation)) |
| `test/` | Automated tests (see [Testing](Testing.md)) |

The rules for code (licence headers, translations, configuration options, dependencies) are in [CONTRIBUTING.md](https://github.com/alasin-app/alasin/blob/main/CONTRIBUTING.md#code).

## Screenshots for alasin.app

`npm run screenshots` takes the app's screenshots for alasin.app, at iPhone and desktop sizes, in light and dark mode:

- Home, Posts, the editor, Categories and Media.
- The features from *What's New* in use: the *Rename or move* sheet in Categories (`category-rename`), an orphaned photo selected in Media (`media-delete`), photos in the Bin (`bin`), a post someone else is editing (`editing`) and Users (`users`).

It runs Alasin locally (`npm run dev --https --remote-media`: the photo buckets are the test site's real ones, read only, so *Media* shows its photos) with the test site's configuration (`--site`, default `app.alasin.dev`) and its sample content, and signs in as the person `gh` is logged in as. Everyone in the screenshots is made up: *Aino Virtanen* instead of the signed-in person, and the other people in Users and the one editing the post. There is no **DEV** badge. Nothing is changed: the Bin's photos, the edit lock and the Users list are answered by the script itself.

Each screenshot is stored the way Alasin stores a photo for the site in `--for` (default `app.alasin`), so its *Media* lists them: a JPEG at most 1600 pixels on the long side, named after the shot, device and mode (`users-desktop-light.jpg`), in that site's `[media] path_pattern` dated `--date` (default today), with its `[images]` sizes next to it. The files go to `.alasin/screenshots/` by their place in the bucket (`--out` for another folder).

It needs the test site's `.dev.vars` (setup writes it when asked *Write … .dev.vars for local development?*) and the browser: `npx playwright install chromium`.

At each release, take them again with `--upload`: they are also put in that site's media bucket, never over an existing photo (if any is already there, nothing is uploaded; use another `--date`). Then link the new ones in alasin.app's *Screenshots*, *Features* and home pages and in [What's New](What's-New.md), and delete the previous ones in its *Media*. Every screenshot is on the *Screenshots* page, so *Media* counts it as used.
