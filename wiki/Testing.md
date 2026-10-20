## Automated tests

| Command | What it checks | Runs in CI |
| --- | --- | --- |
| `npm test` | The Worker (in the Workers runtime, with Miniflare), the configuration and the scripts | yes |
| `npm run lint` | ESLint, that the [configuration reference](Configuration.md) is up to date, and that no deployment details are committed | yes |
| `npx markdownlint-cli2` | Markdown style of the documentation | yes |
| `npm run typecheck` | TypeScript, for the Worker, the app and the scripts | yes |
| `npm run skeleton:check` | Builds the skeleton site (`templates/site/`) with the Hugo and theme versions it pins: once with test content using every Alasin feature, once with the [test environment](Test-Environment.md)'s sample content. Checks covers, images, galleries, YouTube, categories, pages in the menu and sub-pages. Needs [Go](https://go.dev/dl/) and network access for the theme | yes |
| `npm run roundtrip -- <site checkout>` | That every Markdown file of a real site comes back byte for byte through the editor (see [Existing Site](Existing-Site.md#2-check-your-existing-posts)) | no |

Security-relevant behaviour always gets a test (see `test/worker/`).

## Manual test runs

What needs real devices, GitHub or Cloudflare is checked by hand, in test runs:

- **The checks** are in [`.github/ISSUE_TEMPLATE/test-run.md`](https://github.com/alasin-app/alasin/blob/main/.github/ISSUE_TEMPLATE/test-run.md), grouped by area. A pull request that adds or changes behaviour adds or updates its checks there.
- **Every pull request lists the checks it affects** under *Manual checks* (the pull request template has the section), or says "none". List only what someone has to redo by hand for this change: what automated tests cover needs no manual check, and the install, deploy and update checks (1.1–1.3) only come up when installing, deploying or updating changes.
- **A test run is an issue** labelled `test-run`. `npm run test-run` builds one from the pull requests merged into `dev` since the last run, with only the checks they list (add more with `--checks 2.21,A.3`); `-- --create` opens it. Tick each check as it passes. For a failure, add a sub-issue to the run whose title starts with the check ID (e.g. "4.19: lock banner missing on iOS"): a workflow marks the check "❌ #123", and "✅ #123 fixed, re-test" once the bug is closed; bugs without a check ID are listed at the end of the run. Close the run when every check is ticked.
- **Where:** only on a development deployment, a [test environment](Test-Environment.md) running the `dev` branch's code, reset to its sample content first; a run doesn't need a fresh installation. **Never on production.** Record the version, the deployment and the devices at the top of the run; never a deployment's own names, addresses or accounts.
- **When:** before a release. A release is cut from code whose run is complete.

Past runs: [closed `test-run` issues](https://github.com/alasin-app/alasin/issues?q=label%3Atest-run).

## Smoke tests after a release

When a release is published from `main` and a production deployment is updated to it ([Updating](Updating.md)), there is no test run: only a few smoke checks, on that deployment:

1. `npm run deploy` finishes without warnings, and the account sheet shows the new version.
2. Signing in works, and the lists show the site's posts, pages and drafts.
3. A post opens in the editor and closes again without changes.
4. The site still loads.

If one fails, report it as a bug and fix it on `dev` like any other; a release that breaks production gets a hotfix (see [CONTRIBUTING.md](https://github.com/alasin-app/alasin/blob/main/CONTRIBUTING.md#branches)).

## Testing the installation

When installing changes (`setup`, `create-site`, or the pages [Before You Start](Before-You-Start.md), [New Site](New-Site.md), [Existing Site](Existing-Site.md) and [Test Environment](Test-Environment.md)), check 1.1 follows the documentation exactly, in a fresh clone, with a site made for the test:

1. A new site with production and dev ([New Site](New-Site.md) with the differences in [Test Environment](Test-Environment.md#a-new-test-site)): both apps signed in, the test site showing the sample content. Or a new deployment for an existing site ([Existing Site](Existing-Site.md)).
2. Nothing may be needed beyond the documentation: anything unclear or missing is a sub-issue of the run.
3. Remove the test site afterwards ([Removing a Site](Removing-a-Site.md)).
