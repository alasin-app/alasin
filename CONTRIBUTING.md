# Contributing to Alasin

Thanks for helping. This page covers how changes flow, how to name them, and what to check before opening a pull request.

## Setup

```sh
npm install        # also installs the git hooks (.githooks/)
npm test
npm run lint
npm run typecheck
```

Running the app locally, a test environment and the code's layout: see [Development](wiki/Development.md) and [Test Environment](wiki/Test-Environment.md).

## Branches

| Branch | Purpose | Gets changes from | Deploys to |
| --- | --- | --- | --- |
| `feat/…`, `fix/…`, `chore/…`, `docs/…` | one change each | — | nothing (CI only) |
| `dev` | integration (default branch) | squash-merged PRs from work branches | the dev environment, on every push |
| `main` | released code | PRs from `dev`, the release PR, hotfixes | production, on each published release |

- **Every new feature has an issue** (the *Feature request* form; ideas are [issues labelled `enhancement`](https://github.com/alasin-app/alasin/issues?q=is%3Aissue+label%3Aenhancement)). Its branch is named after the issue, `feat/<issue>-<short-name>` (e.g. `feat/156-rename-categories`), and the PR description says `Closes #<issue>`.
- Start work branches from `dev` and open the pull request into `dev`. PRs are **squash-merged**, so the PR title becomes the commit message.
- Promote `dev` to `main` with a PR merged as a **merge commit, not a squash**, so every conventional commit reaches `main` and the changelog.
- **Hotfixes:** a `fix/…` branch from `main`, PR into `main`, release, then merge `main` back into `dev`.
- After each release, merge `main` back into `dev`.
- Don't commit directly to `dev` or `main`. (While the repository is private on GitHub's Free plan this is a convention; branch protection is enabled once it's public.)

## Pull request titles

Titles follow [Conventional Commits](https://www.conventionalcommits.org/), checked by CI. The type decides the next version:

| Type | Example | Release |
| --- | --- | --- |
| `feat:` | `feat: insert a gallery when several photos are picked` | minor (0.9.0 → 0.10.0) |
| `fix:` | `fix: keep front matter order when saving` | patch (0.9.0 → 0.9.1) |
| `perf:` | `perf: build the search index in a web worker` | patch |
| `docs:`, `chore:`, `ci:`, `test:`, `refactor:`, `style:`, `build:` | `docs: explain dev deployments` | none on their own |

A scope is optional: `fix(editor): …`.

### Breaking changes

Mark them with `!` (`feat!: …`) or a `BREAKING CHANGE:` footer, and put **upgrade steps** in the PR description; they end up in the release notes. A breaking change bumps the major version (1.4.2 → 2.0.0).

When an `alasin.toml` option is renamed or removed, add a migration to `scripts/lib/migrate.ts` (with a test), so `npm run setup` updates existing files automatically.

For Alasin, a change is breaking if an existing deployment would stop working or behave differently after updating without the operator doing something, in particular:

- an `alasin.toml` option is removed, renamed or changes meaning, or a new option is required;
- `wrangler.toml` needs new or changed bindings, migrations or secrets that `npm run setup` can't add automatically;
- the GitHub App needs new permissions;
- the way Alasin writes content changes (front matter fields, file paths, image paths or naming in R2).

## Releases

Nobody edits version numbers by hand. After each merge to `main`, [release-please](https://github.com/googleapis/release-please) opens or updates a release PR with the version bump and `CHANGELOG.md`. Merging it tags `vX.Y.Z` and publishes the GitHub Release, which deploys production (if continuous deployment is enabled).

### Before 1.0.0

Until 1.0.0, releases were pre-releases numbered `1.0.0-pre.N`. Since 1.0.0 the commit types decide the version as in the table above.

To set a version by hand at any time, add a `Release-As: X.Y.Z` footer to a commit that reaches `main`.

Release PRs are created with the workflow token, so CI doesn't run on them automatically; push an empty commit to the release branch or re-run the checks if you need them.

## Keep deployment details out of the repository

Alasin is generic. Nothing that identifies a real deployment — site names, domains, bucket names, usernames, account IDs, post content, screenshots of a real site — may appear in code, tests, docs, commit messages, branch names or PR text. Use `example.com`-style placeholders and synthetic test fixtures.

If you run a deployment, list its identifying terms in `.local/denylist` (gitignored, one per line). The pre-commit and commit-msg hooks and `npm run lint` then refuse anything that contains them. Keep your own `alasin.toml`, `wrangler.toml` and `.dev.vars` in `deployments/<site>/` (gitignored; see [Configuration Files](wiki/Configuration-Files.md)) or a separate private repository. Like `.local/`, nothing under `deployments/` can be committed: the hooks and `npm run lint` refuse it.

## Code

- TypeScript, small modules; the layout is in [Development](wiki/Development.md#code).
- A change to `templates/site/` or `templates/sample/` is checked by `npm run skeleton:check` (needs Go); CI runs it too.
- Every source file starts with `// SPDX-License-Identifier: MIT`.
- All user-visible text goes through `t()` in `src/web/lib/i18n.ts`, in English and Finnish.
- New `alasin.toml` options go in `src/shared/config/schema.ts` with a description and in `alasin.example.toml`; then run `npm run docs:config`, which updates [Configuration](wiki/Configuration.md).
- Dependencies must have MIT-compatible licences (MIT, BSD, Apache-2.0, ISC) and are pinned exactly.
- Security-relevant behaviour gets a test (see `test/worker`).
- Things only a person on a real device can check are manual checks: see *Manual tests* below.
- A change that users or operators notice updates the documentation in the same pull request: see *Documentation* below.

## Manual tests

What needs real devices, GitHub or Cloudflare is checked by hand, in test runs: see [Testing](wiki/Testing.md#manual-test-runs). In short:

- A pull request that adds or changes behaviour adds or updates its checks in [`.github/ISSUE_TEMPLATE/test-run.md`](.github/ISSUE_TEMPLATE/test-run.md).
- **Every pull request lists the checks it affects** under *Manual checks*, or says "none": only what someone has to redo by hand for this change.

## Documentation

The documentation is in [`wiki/`](wiki/Home.md), written to be published as the repository's GitHub wiki. It has two audiences, kept apart:

- **Running a site:** for the person who sets up and looks after a site. Only what they need: production, no test environment, no development.
- **Developing and testing:** contributors and testers: [Development](wiki/Development.md), [Test Environment](wiki/Test-Environment.md), [Testing](wiki/Testing.md). This file stays in the repository, since GitHub shows it with pull requests.

Conventions, so the pages work both here and in the wiki:

- **One file per page.** The file name is the page name with hyphens for spaces (`Users-and-Access.md` → *Users and Access*). `Home.md` is the start page; `_Sidebar.md` lists every page, so a new page is added there too.
- **No `#` title:** the wiki shows the page name. Pages start at `##` (`wiki/.markdownlint.yaml`).
- **Links between pages** are relative, with `.md` (`[Updating](Updating.md#…)`); publishing removes the `.md`. **Links to repository files** are absolute: `https://github.com/alasin-app/alasin/blob/main/…`.
- **Generated:** the reference in [Configuration](wiki/Configuration.md) between its markers comes from the config schema (`npm run docs:config`; `npm run lint` checks it).
- No deployment details, as everywhere (see above).

## Reporting security issues

Not in public issues — see [SECURITY.md](SECURITY.md).
