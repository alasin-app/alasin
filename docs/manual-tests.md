# Manual tests

Automated tests (`npm test`) cover the Worker, the configuration and the scripts. Some things can only be checked by hand on real devices and a real deployment: installation from the docs, logging in with GitHub, and how the app looks and feels on an iPhone. This page lists those checks and records each time they were run.

Run them on a **dev deployment** (a separate Worker, see the README's *Production and dev deployments*), never on production. Record results below with the date, Alasin version and devices; never the deployment's own names, addresses or accounts.

Result marks: ✅ passed · ❌ failed (with the fix) · ⏳ not run yet.

## Milestone 1 — login, security and app shell

### Checklist

| # | Check | How |
| --- | --- | --- |
| 1.1 | Install from a clean clone | Follow PREREQUISITES.md and the README's *Installation* exactly, for a dev environment (`--env dev`) with a custom domain |
| 1.2 | Deploy | `npm run deploy -- --env dev` names the right Worker, environment, address and site branch, and finishes without warnings |
| 1.3 | Update | In the deploy clone: `git pull && npm install && npm run deploy -- --env dev`; the account sheet shows the new version |
| 1.4 | Login page | Shows app name, icon and the environment badge; the browser offers to install the app |
| 1.5 | Log in (allowed account) | *Sign in with GitHub* → authorize the GitHub App → the app opens with the user's GitHub avatar |
| 1.6 | Log in (other account) | A GitHub account that isn't in `[users] allow` ends on "This GitHub account isn't allowed…" |
| 1.7 | Account sheet | Avatar → name, `@login`, environment badge, *View site*, version, language switch (English/Suomi) |
| 1.8 | Log out | *Log out* → confirmation action sheet → back on the login page; reloading stays logged out |
| 1.9 | Desktop / iPad layout | Window ≥ 768 px: sidebar with all sections; badge and avatar only in the sidebar |
| 1.10 | iPhone layout | On iPhone: tab bar (Home, Drafts, Media, More), large title, account sheet as a bottom sheet |
| 1.12 | iPhone Safari | 1.4–1.10 in Safari on iPhone, including *Add to Home Screen* (icon and standalone mode) |
| 1.11 | Dark mode | Device in dark mode: native-looking dark colours on both layouts |

### Test runs

#### 2026-10-15 — v0.10.2 / v0.10.3, dev deployment with a custom domain

Devices: Chrome on macOS (desktop), Chrome on iPhone (WebKit, like all iOS browsers).

| # | Result | Notes |
| --- | --- | --- |
| 1.1 | ✅ | Passed after fixes found along the way: bare hostnames accepted in setup (#16); older `alasin.toml` files migrated by setup (#20); options swallowed by `npm run` without `--` detected (#24); setup confirms Worker name, branch and badge (#25); drafts bucket name suggested from the media bucket (#32). Docs clarified: tool versions (#6), closing the browser tab after `wrangler login` (#12), private site repository (#13, #14), GitHub App steps moved into the README (#15). |
| 1.2 | ✅ | Wrangler warnings about preview URLs and the `workers.dev` address fixed (#33, #38). |
| 1.3 | ✅ | v0.10.2 → v0.10.3 deployed from the deploy clone. |
| 1.4 | ✅ | |
| 1.5 | ✅ | Desktop and iPhone. |
| 1.6 | ⏳ | Covered by automated tests; not yet run by hand. |
| 1.7 | ✅ | |
| 1.8 | ✅ | Reloading after logout not yet checked explicitly. |
| 1.9 | ❌ → ✅ | Badge and avatar were repeated above the content in light mode; fixed in #34. |
| 1.10 | ✅ | |
| 1.11 | ⏳ | Checked on desktop screenshots during development only. |
| 1.12 | ⏳ | Not yet run in Safari. |
