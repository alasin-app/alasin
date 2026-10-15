# Contributing to Alasin

Thanks for helping. This page covers how changes flow, how to name them, and what to check before opening a pull request.

## Setup

```sh
npm install        # also installs the git hooks (.githooks/)
npm test
npm run lint
npm run typecheck
```

`npm run dev` runs the app locally; see the README's *Local development* section.

## Branches

| Branch | Purpose | Gets changes from | Deploys to |
| --- | --- | --- | --- |
| `feat/…`, `fix/…`, `chore/…`, `docs/…` | one change each | — | nothing (CI only) |
| `dev` | integration (default branch) | squash-merged PRs from work branches | the dev environment, on every push |
| `main` | released code | PRs from `dev`, the release PR, hotfixes | production, on each published release |

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

Mark them with `!` (`feat!: …`) or a `BREAKING CHANGE:` footer, and put **upgrade steps** in the PR description; they end up in the release notes. Before 1.0, a breaking change bumps the minor version.

When an `alasin.toml` option is renamed or removed, add a migration to `scripts/lib/migrate.ts` (with a test), so `npm run setup` updates existing files automatically.

For Alasin, a change is breaking if an existing deployment would stop working or behave differently after updating without the operator doing something, in particular:

- an `alasin.toml` option is removed, renamed or changes meaning, or a new option is required;
- `wrangler.toml` needs new or changed bindings, migrations or secrets that `npm run setup` can't add automatically;
- the GitHub App needs new permissions;
- the way Alasin writes content changes (front matter fields, file paths, image paths or naming in R2).

## Releases

Nobody edits version numbers by hand. After each merge to `main`, [release-please](https://github.com/googleapis/release-please) opens or updates a release PR with the version bump and `CHANGELOG.md`. Merging it tags `vX.Y.Z` and publishes the GitHub Release, which deploys production (if continuous deployment is enabled).

Release PRs are created with the workflow token, so CI doesn't run on them automatically; push an empty commit to the release branch or re-run the checks if you need them.

## Keep deployment details out of the repository

Alasin is generic. Nothing that identifies a real deployment — site names, domains, bucket names, usernames, account IDs, post content, screenshots of a real site — may appear in code, tests, docs, commit messages, branch names or PR text. Use `example.com`-style placeholders and synthetic test fixtures.

If you run a deployment, list its identifying terms in `.local/denylist` (gitignored, one per line). The pre-commit and commit-msg hooks and `npm run lint` then refuse anything that contains them. Keep your own `alasin.toml`, `wrangler.toml` and `.dev.vars` in `.local/` or a separate private repository.

## Code

- TypeScript, small modules: `src/worker` (API), `src/web` (app), `src/shared` (config schema and helpers), `scripts` (setup and deploy).
- Every source file starts with `// SPDX-License-Identifier: MIT`.
- All user-visible text goes through `t()` in `src/web/lib/i18n.ts`, in English and Finnish.
- New `alasin.toml` options go in `src/shared/config/schema.ts` with a description and in `alasin.example.toml`; then run `npm run docs:config`.
- Dependencies must have MIT-compatible licences (MIT, BSD, Apache-2.0, ISC) and are pinned exactly.
- Security-relevant behaviour gets a test (see `test/worker`).

## Reporting security issues

Not in public issues — see [SECURITY.md](SECURITY.md).
