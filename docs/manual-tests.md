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
| 1.8 | ✅ | Reloading after logout stays on the login page. After confirming, the account sheet reappeared until logout finished, which was confusing; a "Logging out…" screen now shows at once (#46). |
| 1.9 | ❌ → ✅ | Badge and avatar were repeated above the content in light mode; fixed in #34. |
| 1.10 | ✅ | |
| 1.11 | ⏳ | Checked on desktop screenshots during development only. |
| 1.12 | ⏳ | Not yet run in Safari. |

## Milestone 2 — drafts and photos

### Checklist

| # | Check | How |
| --- | --- | --- |
| 2.1 | New draft | *New post* → title, text, categories, tags → *Save draft*; the file appears in `drafts/posts/` on the site branch, committed as the user |
| 2.2 | Reopen and edit | Drafts → open the draft → change it → *Save draft*; status shows unsaved changes until saved |
| 2.3 | Autosave | Close the tab while editing, reopen the draft: "Restored changes…" and the text is there |
| 2.4 | Conflict | Edit the draft file on GitHub, then save in Alasin: asked which version to keep; nothing overwritten silently |
| 2.5 | Date | The date shows in the device's time zone; the file stores it in UTC |
| 2.6 | Lists and quotes | Enter continues list items (`-`, `1.`) and quote lines (`>`); Enter on an empty item ends them |
| 2.7 | One photo | Photo button → one photo: progress, then `![](…)` in the text and the photo as cover |
| 2.8 | Gallery | Select several photos at once: a gallery shortcode block with all of them |
| 2.9 | iPhone photos | 2.7 and 2.8 on iPhone (HEIC from the library is converted by iOS; WebP sizes come from the bundled encoder) |
| 2.10 | Cover picker | Cover image → choose another photo of the draft, or *No cover image* |
| 2.11 | No GPS | Download a draft image (`/api/draft-media/…`) and check it has no location metadata |
| 2.12 | Drafts bucket | The drafts bucket has `<draftId>/<name>.jpg` and `<name>-<width>.webp` files; the public media bucket is unchanged |
| 2.13 | Live formatting | Headings, bold, italic, links, lists and quotes show formatted; their Markdown markers appear only where the cursor is |
| 2.14 | Line breaks | In rich text, Enter starts a new line that also shows as its own line on the site, Enter twice a new paragraph; no Shift+Enter needed. Select pasted lines (e.g. a poem) and tap Quote: lines stay lines, stanzas stay apart; tap Quote again to remove it |
| 2.15 | Images and galleries | Images show inline with ✕ to remove; a gallery is a card whose photos can be reordered (drag or ‹ ›) and removed |
| 2.16 | Markdown mode | The Markdown button (right end of the toolbar) shows the whole file incl. front matter; editing there and switching back keeps every change; nothing changes by just switching |
| 2.17 | Shortcodes | Other shortcodes (e.g. `instagram`) show as protected blocks and stay exactly as written |
| 2.18 | YouTube video | Video button → paste a YouTube link (watch, youtu.be, shorts) or a bare video ID → `{{< youtube ID >}}` at the cursor, previewed with its thumbnail; anything else is refused with a message |

### Test runs

#### 2026-10-15 — dev deployment, Chrome on macOS

| # | Result | Notes |
| --- | --- | --- |
| 2.1 | ✅ | Draft committed to `drafts/posts/` on the site branch. |
| 2.2 | ✅ | |
| 2.3 | ✅ | |
| 2.4 | ✅ | Asked which version to keep. |
| 2.5 | ✅ | Shown and edited in local time, stored in UTC. |
| 2.6 | ❌ → ✅ | Empty items stayed after ending a list (#52); empty markers now tidied on save (#53); quote lines continue line by line (#54, #59). |
| 2.7 | ✅ | First photo became the cover. |
| 2.8 | ✅ | Four photos as a gallery. Gallery images stay separated by blank lines: sites whose image render hook uses `.IsBlock` need them for figures and lightbox links. |
| 2.9 | ✅ | On iOS: photos from the Photos library and taken with the camera. |
| 2.10 | ✅ | On iOS. |
| 2.11 | ✅ | Photo taken on iOS, checked with exiftool: no GPS or other camera metadata in the JPEG or any WebP size (`keep_exif = false`). |
| 2.12 | ✅ | Main JPEG and 480/960/1600 WebP variants under the draft's prefix in the drafts bucket. |
| 2.13 | ✅ | Horizontal rules shown as text at first; fixed (#57). Heading levels 2–5 added (#58). |
| 2.14 | ❌ → ✅ | Line breaks needed Shift+Enter, which tablets don't have; now Enter makes a line break, Enter twice a paragraph, and Quote on a selection keeps lines and stanzas (#60). |
| 2.15 | ✅ | |
| 2.16 | ✅ | The mode switch moved from above the details to a toolbar button (#63). |
| 2.17 | ✅ | |
| 2.18 | ⏳ | Added after this run (#69). |

Also found during this run: reloading after a new deployment gave a blank page (old script names answered with the app page); fixed with real 404s, a no-store app page and a one-time automatic reload (#55).
