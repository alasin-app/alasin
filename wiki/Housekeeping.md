Secrets are rotated by hand, and Alasin reminds you when it's time. `npm run setup` records in `alasin.toml` when each secret was last rotated (`[security] session_keys_rotated`, `github_secrets_rotated`). Once `[security] rotation_reminder_days` (default 180) have passed, `npm run deploy` prints a reminder with the exact steps, and the app's account sheet shows a *Housekeeping* section.

| Task | How often | How |
| --- | --- | --- |
| Rotate the session and token keys | when reminded | `npm run setup -- --site <site> --rotate-keys` (everyone has to log in again) |
| Rotate the GitHub App's client secret and private key | when reminded | see [Rotating secrets](#rotating-secrets) |
| Update Alasin | when a release appears | see [Updating](Updating.md) |
| Remove photos of drafts that no longer exist from the `DRAFTS` bucket | nightly, automatic | a Cron Trigger (`[drafts] cleanup_cron`, 03:17 UTC by default) with a read-only installation token of the GitHub App; waits `[drafts] cleanup_after_days` (7) and deletes nothing if the repository can't be read. Shows as `drafts_cleanup` in the Worker's logs |
| Review who may log in | now and then | the site repository's collaborators on GitHub; see [Users and Access](Users-and-Access.md) |

## Rotating secrets

Per deployment; add `--env dev` for a [test environment](Test-Environment.md)'s app.

| Secret | How to rotate | Effect |
| --- | --- | --- |
| `SESSION_KEY`, `TOKEN_KEY` | `npm run setup -- --site <site> --rotate-keys` | Everyone has to log in again |
| `GITHUB_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY` | On the GitHub App's settings page, generate a new client secret and a new private key; run `npm run setup -- --site <site> --rotate-github` and enter them; then delete the old ones on GitHub | None |

Pass `--config <path to wrangler.toml>` to `wrangler secret put` if your configuration lives outside this repository.
