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

`npm run screenshots` takes the app's screenshots for alasin.app: Home, Posts, the editor, Categories and Media, at iPhone and desktop sizes, in light and dark mode. It runs Alasin locally (`npm run dev --https --remote-media`: the photo buckets are the test site's real ones, read only, so *Media* shows its photos) with the test site's configuration (`--site`, default `app.alasin.dev`) and its sample content, signs in as the person `gh` is logged in as, and shows a made-up person (*Aino Virtanen*) instead of them, without the **DEV** badge. The images go to `.alasin/screenshots/` (`--out` for another folder).

It needs the test site's `.dev.vars` (setup writes it when asked *Write … .dev.vars for local development?*) and the browser: `npx playwright install chromium`.

At each release, take them again and upload them over the old ones in alasin.app's media bucket, under `screenshots/` with the same names (as JPEG, at most 1600 pixels on the long side); its *Screenshots* page and home page show them from there.
