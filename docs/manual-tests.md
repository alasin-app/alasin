# Manual tests

Automated tests (`npm test`) cover the Worker, the configuration and the scripts. Some things can only be checked by hand on real devices and a real deployment: installation from the docs, logging in with GitHub, and how the app looks and feels on iOS. This page lists those checks and records each time they were run.

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
| 1.10 | iOS layout | On iOS, window < 768 px (phones): tab bar (Home, Drafts, Media, More), large title, account sheet as a bottom sheet |
| 1.11 | Dark mode | Device in dark mode: native-looking dark colours on both layouts |
| 1.12 | iOS Safari | 1.4–1.10 in Safari on iOS, including *Add to Home Screen* (icon and standalone mode) |
| 1.13 | Hide sidebar | Window ≥ 768 px: the button at the bottom of the sidebar shrinks it to icons (names as tooltips; the environment badge stays at the top) and back; the choice is remembered on the device |

### Test runs

#### 2026-10-15 — v0.10.2 / v0.10.3, dev deployment with a custom domain

Devices: Chrome on macOS (desktop), Chrome on iOS (WebKit, like all iOS browsers).

| # | Result | Notes |
| --- | --- | --- |
| 1.1 | ✅ | Passed after fixes found along the way: bare hostnames accepted in setup (#16); older `alasin.toml` files migrated by setup (#20); options swallowed by `npm run` without `--` detected (#24); setup confirms Worker name, branch and badge (#25); drafts bucket name suggested from the media bucket (#32). Docs clarified: tool versions (#6), closing the browser tab after `wrangler login` (#12), private site repository (#13, #14), GitHub App steps moved into the README (#15). |
| 1.2 | ✅ | Wrangler warnings about preview URLs and the `workers.dev` address fixed (#33, #38). |
| 1.3 | ✅ | v0.10.2 → v0.10.3 deployed from the deploy clone. |
| 1.4 | ✅ | |
| 1.5 | ✅ | Desktop and iOS. |
| 1.6 | ⏳ | Covered by automated tests; not yet run by hand. |
| 1.7 | ✅ | |
| 1.8 | ✅ | Reloading after logout stays on the login page. After confirming, the account sheet reappeared until logout finished, which was confusing; a "Logging out…" screen now shows at once (#46). |
| 1.9 | ❌ → ✅ | Badge and avatar were repeated above the content in light mode; fixed in #34. |
| 1.10 | ✅ | |
| 1.11 | ✅ | |
| 1.12 | ✅ | |
| 1.13 | ✅ | Added after this run. Toggle moved to the bottom of the sidebar (#72); the environment badge now stays in the hidden sidebar instead of moving to the title bar (#73). |

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
| 2.9 | iOS photos | 2.7 and 2.8 on iOS (HEIC from the library is converted by iOS; WebP sizes come from the bundled encoder) |
| 2.10 | Cover picker | Cover image → choose another photo of the draft, or *No cover image* |
| 2.11 | No GPS | Download a draft image (`/api/draft-media/…`) and check it has no location metadata |
| 2.12 | Drafts bucket | The drafts bucket has `<draftId>/<name>.jpg` and `<name>-<width>.webp` files; the public media bucket is unchanged |
| 2.13 | Live formatting | Headings, bold, italic, links, lists and quotes show formatted; their Markdown markers appear only where the cursor is |
| 2.14 | Line breaks | In rich text, Enter starts a new line that also shows as its own line on the site, Enter twice a new paragraph; no Shift+Enter needed. Select pasted lines (e.g. a poem) and tap Quote: lines stay lines, stanzas stay apart; tap Quote again to remove it |
| 2.15 | Images and galleries | Images show inline with ✕ to remove; a gallery is a card whose photos can be reordered (drag or ‹ ›) and removed |
| 2.16 | Markdown mode | The Markdown button (right end of the toolbar) shows the whole file incl. front matter; editing there and switching back keeps every change; nothing changes by just switching |
| 2.17 | Shortcodes | Other shortcodes (e.g. `instagram`) show as protected blocks and stay exactly as written |
| 2.18 | YouTube video | Video button → paste a YouTube link (watch, youtu.be, shorts) or a bare video ID → `{{< youtube ID >}}` at the cursor, previewed with its thumbnail; anything else is refused with a message. A YouTube link pasted on a line of its own becomes the shortcode too |
| 2.19 | Category tree | Categories with a parent show indented under it in the picker (siblings by title); choosing a child doesn't add its parent; the chip shows the full path on hover |

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
| 2.18 | ✅ | Added after this run (#69); a YouTube link pasted on its own line now becomes the shortcode too (#70). |
| 2.19 | ⏳ | Added after this run. |

Also found during this run: reloading after a new deployment gave a blank page (old script names answered with the app page); fixed with real 404s, a no-store app page and a one-time automatic reload (#55).

## Milestone 3 — publish, archive and delete

Before starting, save a listing of the public media bucket (`npx wrangler r2 object list <media-bucket>` or the dashboard) to compare at the end.

### Checklist

| # | Check | How |
| --- | --- | --- |
| 3.1 | Publish | Draft with a title, text and photos → *Publish* → confirm: "Published" with the file's path; the file is in the posts folder (not in `drafts/`), with `draft: false` and no `draftId`, in one commit as the user |
| 3.2 | Published photos | The photos used in the text and the cover are in the media bucket under the date path, with their WebP sizes; the text and cover refer to them with the site's image prefix; the draft's folder in the drafts bucket is empty (also photos that weren't used) |
| 3.3 | Unsaved changes | Change the text, then *Publish* without saving: the change is saved first and is in the published file |
| 3.4 | Address taken | Publish a draft whose address (slug) is already used by a post: refused with a message, the draft stays; change the slug and publish again |
| 3.5 | Nothing overwritten | Compare the media bucket with the listing from the start: only new files were added; a photo whose name was taken got `-2` |

### Test runs

#### 2026-10-15 — dev deployment

| # | Result | Notes |
| --- | --- | --- |
| 3.1 | ✅ | |
| 3.2 | ✅ | |
| 3.3 | ✅ | |
| 3.4 | ✅ | |
| 3.5 | ✅ | Media bucket listing compared before and after: only new files. |

## Milestone 4 — lists and editing existing posts

### Checklist

| # | Check | How |
| --- | --- | --- |
| 4.1 | Round trip | `npm run roundtrip -- <site checkout>` reports every file saved unchanged |
| 4.2 | Posts list | *Posts*: every post, grouped by year and month, newest first; the current year open, other years open and close; drafts marked; categories by name |
| 4.3 | Pages list | *Pages*: every page, by title |
| 4.4 | Search | Type part of a word from a title or from the text, with or without ä/ö/å, or with a small typo: matching posts appear as you type, title matches first, with the matching words highlighted |
| 4.5 | Filters | *Drafts* and *Archived* show only those; choosing one or more categories from the tree shows the posts in any of them or in a category below them; filters and search combine |
| 4.6 | Up to date | Edit a post on GitHub, then open the list again: the change is there (the list is read again only when the repository changed) |
| 4.7 | Drafts section | *Drafts* lists drafts saved by Alasin, posts and pages marked `draft: true` in the content folders, and drafts only on this device |
| 4.8 | Quick lists | Opening Posts, Pages or Drafts again shows the list at once; after a change on GitHub the list updates within seconds without reading everything again |
| 4.9 | Authors | Rows show the author (an older author name listed in a user's `aliases` shows that user's avatar) and the full name of who last changed the file, and when; new posts get the user's full name as author, from their GitHub profile; other users' posts show their avatars too, with only `login` and `id` in `[users]` |
| 4.10 | Edit a published post | Open a post from *Posts*, change the text → *Save*: the commit changes only the edited lines and `lastmod`; editing a title or tag changes only that line of the front matter |
| 4.11 | Address or date changed | Change a published post's address (slug) or date → *Save*: the `url` field follows (with `[site] post_url` set) |
| 4.12 | Photos in a published post | Add a photo to a published post → *Save*: it is copied to the media bucket under the post's date and the text refers to it with the site's image prefix |
| 4.13 | Published elsewhere | Device A: change a saved draft without saving. Device B: publish it. Device A: *Drafts* shows it as "published or deleted elsewhere"; opening it offers *Use my changes in the published post* (opens the post with the changes, unsaved) or *Discard my changes* |
| 4.14 | Unsaved edits listed | Change a published post without saving and leave: *Drafts* lists it under "Unsaved changes to published posts" |

### Test runs

#### 2026-10-15 — site checkout, development

| # | Result | Notes |
| --- | --- | --- |
| 4.1 | ❌ → ✅ | At first two posts changed: saving tidied line breaks at the ends of paragraphs that the original posts have on purpose. Tidying now touches only lines changed since the last save, and a file without a final newline keeps it that way. All files now save unchanged. |
| 4.2 | ✅ | The author should show too (author names from the old blog need mapping to GitHub users). Loading felt slow. |
| 4.3 | ✅ | |
| 4.4 | ✅ | |
| 4.5 | ❌ → ⏳ | The category filter allowed only one category; now several, including the categories below them (#85). |
| 4.6 | ✅ | |
| 4.7 | ⏳ | |
| 4.8 | ⏳ | |
| 4.9 | ⏳ | |
| 4.10 | ⏳ | |
| 4.11 | ⏳ | |
| 4.12 | ⏳ | |
| 4.13 | ⏳ | Reported: such a draft was listed as a draft on device A; fixed in #90. |
| 4.14 | ⏳ | |
