---
name: Manual test run
about: Check by hand what automated tests can't (real devices, GitHub, Cloudflare). Usually opened with npm run test-run.
title: "Test run: "
labels: test-run
---

<!-- Opened by hand, this is a full run: delete the areas and checks the changes didn't touch. `npm run test-run` opens a run with only the checks affected by the pull requests merged since the last run. -->

- **Version:** `dev` at (commit; shown in the account sheet)
- **Deployment:** <https://app.dev.alasin.app> (the test site, deployed from `dev` by CI)
- **Devices:** iOS Safari, macOS Chrome

Tick a check when it passes. For a failure, add a sub-issue (*Sub-issues* → *Create sub-issue*) whose title starts with the check ID, e.g. "4.19: lock banner missing on iOS": the check gets "❌ #123", and "✅ #123 fixed, re-test" once the bug is closed. Tick the check when the re-test passes.

## Login, security and app shell

- [ ] **1.1 Install from a clean clone**: Only when installing changes (setup, create-site, or the wiki's installation pages). In a new clone, follow the wiki exactly (Testing → Testing the installation): New Site with the Test Environment differences, to a new site with production and dev (both apps signed in, dev showing the sample content), or Existing Site to a new deployment for an existing site; nothing needed beyond the documentation
- [ ] **1.2 Deploy**: Only when deploying changes. `npm run deploy` names the right Worker, environment, address and site branch, and finishes without warnings
- [ ] **1.3 Update**: Only when updating changes (e.g. a new setup migration). In the deploy clone: `git pull && npm install && npm run setup && npm run deploy`; setup reports what it updated, and the account sheet shows the new version
- [ ] **1.4 Login page**: Shows app name, icon and the environment badge; the browser offers to install the app
- [ ] **1.5 Log in (allowed account)**: *Sign in with GitHub* → authorize the GitHub App → the app opens with the user's GitHub avatar
- [ ] **1.6 Log in (other account)**: A GitHub account without write access to the site repository ends on "This GitHub account isn't allowed…"
- [ ] **1.7 Account sheet**: Avatar → name, `@login`, environment badge, *View site*, version, language switch (English/Suomi)
- [ ] **1.8 Log out**: *Log out* → confirmation action sheet → back on the login page; reloading stays logged out
- [ ] **1.9 Desktop / iPad layout**: Window ≥ 768 px: sidebar with all sections; badge and avatar only in the sidebar; at its bottom, *alasin.app* (opens Alasin's website in a new tab), then the version and build
- [ ] **1.10 iOS layout**: On iOS, window < 768 px (phones): tab bar (Home, Drafts, Media, More), large title, account sheet as a bottom sheet
- [ ] **1.11 Dark mode**: Device in dark mode: native-looking dark colours on both layouts
- [ ] **1.12 iOS Safari**: 1.4–1.10 in Safari on iOS, including *Add to Home Screen* (icon and standalone mode)
- [ ] **1.13 Hide sidebar**: Window ≥ 768 px: the button at the bottom of the sidebar shrinks it to icons (names as tooltips; the environment badge stays at the top) and back; the choice is remembered on the device
- [ ] **1.14 Plain ASCII configuration**: `alasin.example.toml` and `wrangler.example.toml` show correctly in an editor that doesn't read UTF-8; `npm run setup` on an older `alasin.toml` and `wrangler.toml` reports "comments … written in plain ASCII", rewrites only comment lines, and the deployment works as before
- [ ] **1.15 Several sites**: Move a deployment's `alasin.toml` and `wrangler.toml` (and `.dev.vars`, if any) into `deployments/<site>/` in the clone: `npm run sites` lists it with its Workers and app URLs; `npm run deploy -- --site <site>` (and `--env dev`) names the deployment and deploys as before; with no `./alasin.toml` and only that site, plain `npm run deploy` uses it and says so; with two sites, it asks for `--site`; `git status` shows nothing under `deployments/`
- [ ] **1.16 create-site plan**: `npm run create-site -- --dry-run` asks for the site repository, Alasin name, environments (production, dev or both) and R2 jurisdiction, and the three domains only when production is included (refusing anything that isn't a hostname). The plan lists the repository, the buckets, the site Worker and the Alasin Worker(s) of the chosen environments only (`<site>-dev-*` and `<alasin>-dev` for dev; `<site>-media`, `<site>-drafts`, `<alasin>` and the domains for production), each "will be created". An existing repository, Worker or a domain that resolves (e.g. the live site's) is marked "EXISTS, not made by this deployment", with the warning that this may be a live site. Without `--dry-run`, going on needs the repository name typed (anything else stops with nothing changed); after typing it, the answers are in `deployments/<site>/create-site.json`, and `--site <site>` shows the same plan without asking again
- [ ] **1.17 create-site on a deployed site**: For a site already in `deployments/<site>/` (e.g. production's, copied there), `npm run create-site -- --site <site> --dry-run` with its own repository and production included: the production buckets and Alasin Worker show under the names in its `wrangler.toml`, and the site Worker under the name in the site repository's Wrangler file, each "[as in …]" and "EXISTS"; the warning starts "This site is already deployed", and no buckets or Workers with other names are planned for production
- [ ] **1.18 create-site creates buckets and repository**: For a new test site (both environments), `npm run create-site`, answer the questions, confirm: the four buckets exist in the chosen jurisdiction (`npx wrangler r2 bucket list`), the dev media bucket has a public `r2.dev` URL (recorded in `create-site.json`), the production media bucket answers on its domain; the private repository has `main` with the skeleton (`hugo.toml` with the site's address and media URL, `config/preview/hugo.toml` with the `r2.dev` URL, `wrangler.jsonc` with the site Worker's name) and a `dev` branch; `deployments/<site>/site/` is a clone of it. Running it again creates nothing new; the plan shows each item as made by this deployment
- [ ] **1.19 create-site builds the site**: With `CLOUDFLARE_BUILDS_TOKEN` set, `npm run create-site -- --site <site>` for the site from 1.18: the site Worker is created and served on the production site's domain; the dashboard's *Builds* for it shows the repository connected, with production from `main` and previews from other branches; the first builds of `main` and `dev` succeed; the production domain shows the site, and the `dev` branch's preview URL shows it with photos from the dev media bucket's `r2.dev` address. Without the token it stops with how to create one; running it again doesn't create a second connection or second triggers
- [ ] **1.20 create-site's dev sample content**: For the site from 1.19 (with dev), `npm run create-site -- --site <site>` asks for a second sample author, prints the production and dev site addresses, commits the sample content to the `dev` branch (one commit; `main` unchanged) and uploads the photos: the dev media bucket has each photo with its `-480.webp` and `-960.webp` sizes plus one unused photo, the dev drafts bucket the draft's photo. After the dev build, the dev site shows five posts with covers, galleries and a video, *About* with two sub-pages, the categories, and *Photo credits*; its photos load from the `r2.dev` address. Running it again doesn't commit or upload again
- [ ] **1.21 create-site sets up Alasin**: For the site from 1.20, `npm run create-site -- --site <site>`: `deployments/<site>/alasin.toml` and `wrangler.toml` are written (production on the app's domain, branch `main`, the production buckets; `[env.dev]` with its own Worker on workers.dev, branch `dev`, the dev buckets and the dev site's and `r2.dev` addresses, badge DEV); setup runs for production and for dev in the same terminal, each creating its GitHub App in the browser, and both are deployed. Signing in to the dev app shows the sample content (five posts by two authors, the drafts, *Archived*, the Bin, the categories, an orphaned photo in *Media*); the production app shows the empty site. Running it again sets nothing up twice
- [ ] **1.22 Reset dev**: In the dev app of a site from 1.21, add a post with a photo, edit a sample post, delete one and empty the Bin. Then `npm run create-site -- --site <site> --reset-dev` lists what it will replace and asks for the repository name (anything else stops with nothing changed); after typing it, the `dev` branch has one new commit, the dev buckets are emptied and get the sample photos again, and after the dev build and a reload the dev app and site show exactly the sample content again (the new post and its photo gone, the edit undone, the deleted post back). Production is unchanged. With uncommitted changes in `deployments/<site>/site/` it refuses
- [ ] **1.23 Remove a site**: `npm run create-site -- --site <site> --remove --dry-run` for a test site lists everything it made and nothing else; for a site in `deployments/` without `create-site.json` (e.g. production's, copied there) it refuses. `--remove-dev` on a test site with both environments, after typing the repository name: the dev Alasin Worker and its KV namespace, the dev GitHub App (deleted on the page it shows, then checked), the dev buckets and the `dev` branch are gone, `[env.dev]` is out of the configuration, and production's site and app still work. `--remove` on the same site: both Alasin Workers, the GitHub Apps, the site Worker with its domain and Workers Builds triggers, all buckets, the repository and `deployments/<site>/` are gone, and the domains no longer answer. Stopping a run (e.g. at a GitHub App) and running it again continues
- [ ] **1.24 Test site**: `npm run create-site` with *Environments* **test**, a repository named after the test site's domain and its three domains: the plan names the items as the test site's; the repository's `main` gets the sample content and the media bucket the photos; the site shows the sample posts on its own domain; its Alasin, on its domain, shows the DEV badge and the sample content and commits to `main`. `--reset-dev` after changes in the app puts `main`'s content folders back to the sample content (the site's configuration stays) and the photos back; `--remove` removes it all
- [ ] **1.25 Test site deployed from CI**: With the `dev` GitHub environment set up as in the wiki (Test Environment → From continuous deployment), a push to `dev` runs *Deploy*, which deploys the test site's Alasin without `--env`; the account sheet shows the new commit's version

## Drafts, editor and photos

- [ ] **2.1 New draft**: *New post* → title, text, categories, tags → *Save draft*; the file appears in `drafts/posts/` on the site branch, committed as the user
- [ ] **2.2 Reopen and edit**: Drafts → open the draft → change it → *Save draft*; status shows unsaved changes until saved
- [ ] **2.3 Autosave**: Close the tab while editing, reopen the draft: "Restored changes…" and the text is there
- [ ] **2.4 Conflict**: Edit the draft file on GitHub, then save in Alasin: asked which version to keep; nothing overwritten silently
- [ ] **2.5 Date**: The date shows in the device's time zone; the file stores it in UTC
- [ ] **2.6 Lists and quotes**: Enter continues list items (`-`, `1.`) and quote lines (`>`); Enter on an empty item ends them
- [ ] **2.7 One photo**: Photo button → one photo: progress, then `![](…)` in the text and the photo as cover
- [ ] **2.8 Gallery**: Select several photos at once: a gallery shortcode block with all of them
- [ ] **2.9 iOS photos**: 2.7 and 2.8 on iOS (HEIC from the library is converted by iOS; WebP sizes come from the bundled encoder)
- [ ] **2.10 Cover picker**: Cover image → choose another photo of the draft, or *No cover image*
- [ ] **2.11 No GPS**: Download a draft image (`/api/draft-media/…`) and check it has no location metadata
- [ ] **2.12 Drafts bucket**: The drafts bucket has `<draftId>/<name>.jpg` and `<name>-<width>.webp` files; the public media bucket is unchanged
- [ ] **2.13 Live formatting**: Headings, bold, italic, links, lists and quotes show formatted; their Markdown markers appear only where the cursor is
- [ ] **2.14 Line breaks**: In rich text, Enter starts a new line that also shows as its own line on the site, Enter twice a new paragraph; no Shift+Enter needed. Select pasted lines (e.g. a poem) and tap Quote: lines stay lines, stanzas stay apart; tap Quote again to remove it
- [ ] **2.15 Images and galleries**: Images show inline with ✕ to remove; a gallery is a card whose photos can be reordered (drag or ‹ ›) and removed
- [ ] **2.16 Markdown mode**: The Markdown button (right end of the toolbar) shows the whole file incl. front matter; editing there and switching back keeps every change; nothing changes by just switching
- [ ] **2.17 Shortcodes**: Other shortcodes (e.g. `instagram`) show as protected blocks and stay exactly as written
- [ ] **2.18 YouTube video**: Video button → paste a YouTube link (watch, youtu.be, shorts) or a bare video ID → `{{< youtube ID >}}` at the cursor, previewed with its thumbnail; anything else is refused with a message. A YouTube link pasted on a line of its own becomes the shortcode too
- [ ] **2.19 Category tree**: Categories with a parent show indented under it in the picker (siblings by title); choosing a child doesn't add its parent; the chip shows the full path on hover
- [ ] **2.20 Fast typing**: Type as fast as you can in the text, also in the middle of a paragraph: every character lands in order, before the cursor
- [ ] **2.21 Details sheet**: *New post* opens a sheet asking the title, date, address, categories, tags and cover; categories and cover open on top of it, and Escape closes only the topmost. Afterwards the details show in short under the title, and *Edit* opens the sheet again (without the title). The title has a pencil after it and isn't hidden under the bar on a tablet or desktop
- [ ] **2.22 Author**: A new draft has the signed-in user as author; *Author* in the details lists the names in use and the users, or takes another name; saving changes only that line. Home → *My drafts* shows only drafts with the signed-in user as author, with the author and no "updated by"
- [ ] **2.23 Page bundle**: Open the sample post *A trail map* (a folder with `index.md` and `trail-map.svg`): the drawing shows above its `figure` shortcode, which stays a protected block, and follows the system's dark mode. Change a word and save: only `index.md` changes. In Markdown mode, set `image: "trail-map.svg"`: the cover thumbnail shows the drawing; in another post, `image: "/posts/trail-map/trail-map.svg"` (another page's bundle by its content path) shows it too

## Publishing, archive and Bin

Before starting, save a listing of the public media bucket (`npx wrangler r2 object list <media-bucket>` or the dashboard) to compare at the end.

- [ ] **3.1 Publish**: Draft with a title, text and photos → *Publish* → confirm: "Published" with the file's path; the file is in the posts folder (not in `drafts/`), with no `draft` key and no `draftId`, in one commit as the user
- [ ] **3.2 Published photos**: The photos used in the text and the cover are in the media bucket under the date path, with their WebP sizes; the text and cover refer to them with the site's image prefix; the draft's folder in the drafts bucket is empty (also photos that weren't used)
- [ ] **3.3 Unsaved changes**: Change the text, then *Publish* without saving: the change is saved first and is in the published file
- [ ] **3.4 Address taken**: Publish a draft whose address (slug) is already used by a post: refused with a message, the draft stays; change the slug and publish again
- [ ] **3.5 Nothing overwritten**: Compare the media bucket with the listing from the start: only new files were added; a photo whose name was taken got `-2`
- [ ] **3.6 Unpublish**: Open a published post → ••• → *Unpublish* → confirm: it opens as a draft (file moved to the drafts folder with a `draftId` and no `draft` key, front matter otherwise as it was); publishing it again puts it back
- [ ] **3.7 Archive**: Open a published post → ••• → *Archive* → confirm: the file moves to `archive/` with its path, unchanged; it shows only under *Archived* in the list
- [ ] **3.8 Republish**: Under *Archived*, tap the post → *Republish*: back at its old path with a new `lastmod`, and opens in the editor
- [ ] **3.10 Locked**: While someone else edits a post, the menu is off for you (read-only), and a direct attempt is refused naming who is editing
- [ ] **3.11 Delete**: In the editor, ••• → *Delete* → confirm, for a published post, a draft and (from the *Archived* list) an archived post: each moves to `bin/` under its old path, off the site; the *Bin* shows them with what they were and who deleted them when; the sidebar shows the count
- [ ] **3.12 Never-saved draft**: For a draft never saved to GitHub the menu offers *Discard*, which says it exists only on this device and discards it (nothing goes to the Bin)
- [ ] **3.13 Recover**: In the *Bin*, tap an item → *Recover*: it's back at its old path (a draft opens in the editor, a post too); for a published post whose address was used again meanwhile, *Recover with a new name* puts it next to it with `-2`
- [ ] **3.14 Delete permanently**: In the *Bin*, an item → *Delete permanently* → confirm: gone from the repository; a deleted draft's photos are removed from the drafts bucket; the media bucket is unchanged
- [ ] **3.15 Empty Bin**: *Empty Bin* → confirm with the number of items: one commit removes them all
- [ ] **3.16 Nightly cleanup**: Upload a photo to a new draft and delete the draft permanently from the Bin with its photos already gone, or delete a draft's file directly on GitHub: its folder stays in the drafts bucket until the nightly run (`[drafts] cleanup_cron`, 03:17 UTC by default) after `[drafts] cleanup_after_days` (7) have passed, then it's gone. Folders of existing drafts (also in the Bin) stay. The Worker's logs show a `drafts_cleanup` line each night

## Lists and editing published posts

- [ ] **4.1 Round trip**: `npm run roundtrip -- <site checkout>` reports every file saved unchanged
- [ ] **4.2 Posts list**: *Posts*: every post, grouped by year and month, newest first; the current year open, other years open and close; drafts marked; categories by name
- [ ] **4.3 Pages list**: *Pages*: every page, by title
- [ ] **4.4 Search**: Type part of a word from a title or from the text, with or without ä/ö/å, or with a small typo: matching posts appear as you type, title matches first, with the matching words highlighted
- [ ] **4.5 Filters**: *Drafts* and *Archived* show only those; choosing one or more categories from the tree shows the posts that have any of exactly those categories (not the categories below them); filters and search combine
- [ ] **4.6 Up to date**: Edit a post on GitHub, then open the list again: the change is there (the list is read again only when the repository changed)
- [ ] **4.7 Drafts section**: *Drafts* lists the drafts in the drafts folder and drafts only on this device
- [ ] **4.8 Quick lists**: Opening Posts, Pages or Drafts again shows the list at once; after a change on GitHub the list updates within seconds without reading everything again
- [ ] **4.9 Authors**: Rows show the author (with an avatar for users of the app, as text for others) and the full name of who last changed the file, and when; new posts get the user's full name as author, from their GitHub profile
- [ ] **4.10 Edit a published post**: Open a post from *Posts*, change the text → *Save*: the commit changes only the edited lines and `lastmod`; editing a title or tag changes only that line of the front matter
- [ ] **4.11 Address or date changed**: Change a published post's address (slug) or date → *Save*: the file is renamed (and moved to another year folder) to match, and the `url` field follows (with `[site] post_url` set)
- [ ] **4.12 Photos in a published post**: Add a photo to a published post → *Save*: it is copied to the media bucket under the post's date and the text refers to it with the site's image prefix
- [ ] **4.13 Published elsewhere**: Device A: change a saved draft without saving. Device B: publish it. Device A: *Drafts* shows it as "published or deleted elsewhere"; opening it offers *Use my changes in the published post* (opens the post with the changes, unsaved) or *Discard my changes*
- [ ] **4.14 Unsaved edits listed**: Change a published post without saving and leave: *Drafts* lists it under "Unsaved changes to published posts"
- [ ] **4.15 My drafts on Home**: *Home* lists your own drafts (by author), drafts only on this device and your unsaved changes to published posts; *Drafts* still lists everyone's
- [ ] **4.16 Author and tag filters**: In Posts and Pages, choose one or more authors and/or tags (the tag list can be searched; counts shown): only matching items show; all filters combine
- [ ] **4.17 Tag suggestions**: In the editor's Tags field, start typing: the site's tags that match appear (most used, and those starting with what you typed, first); tapping one completes it
- [ ] **4.18 New version notice**: Keep the app open (also on a phone, in the background), deploy a new build, come back to the app (or wait up to 10 minutes): "A new version of Alasin is available" with *Reload*; after reloading, unsaved text is still there
- [ ] **4.19 One editor at a time**: Open a post on device A, then the same post on device B (or another user): B shows "(name) is editing this", read-only (text, details, toolbar and saving off); the lists show "✎ (name) is editing" on that post
- [ ] **4.20 Take over**: On B, *Take over editing* → confirm: B can edit (the text is read again first); A shows "(name) took over editing" when it's next active, read-only, with its unsaved text kept
- [ ] **4.21 Abandoned lock**: With B showing the post read-only, close A's tab without leaving the editor (or put the phone to sleep): after about 3 minutes (`[editor] lock_expiry_seconds`) B becomes editable by itself, with the text read again
- [ ] **4.22 Users**: The *Users* section (sidebar; on phones under *More*) lists everyone who can log in with avatar, full name, login and permission on the site repository
- [ ] **4.23 Access from the repository**: A GitHub user with write access to the site repository can log in, one with read access or none gets "isn't allowed"; *Users* lists the repository's writers
- [ ] **4.24 Removed on GitHub**: Remove a logged-in user from the repository's collaborators (or set *Read*): within about an hour, their next action logs them out
- [ ] **4.25 Setup**: `npm run setup` asks nothing about users, and removes a `[users]` table from an older `alasin.toml`
- [ ] **4.26 My recent posts on Home**: Below *My drafts*, *My recent posts* lists your published posts with the latest dates, 5, 10 or 20 of them (the choice is remembered on the device); a row opens the post
- [ ] **4.27 Settings change**: Change `[site] author_field` (or a folder or media setting) and deploy, without new commits in the site repository: opening Posts reads the list again by itself, and authors with avatars show without tapping ↻
- [ ] **4.28 Invite and remove (admin)**: As a repository admin, *Users* shows *Invite on GitHub* and a *Remove* on everyone but you; both open the repository's *Collaborators and teams* settings on GitHub in a new tab. Invite someone with Write: as soon as they accept, coming back to *Users* lists them (no waiting); once they sign in, they're also in the author lists of everyone else's app after a reload
- [ ] **4.29 Invite and remove (not admin)**: As a writer who isn't an admin, *Users* has no *Invite* or *Remove*, only the note that admins invite and remove people
- [ ] **4.30 Oldest first**: In *Posts*, *Newest first* → *Oldest first*: years, months and posts run from the oldest; tapping it again goes back. *Pages* has no such button (always by title)
- [ ] **4.31 List in the address**: In *Posts*, choose a state, a category, an author and a tag, *Oldest first* and type a search: the address shows them all (`?state=…&category=…&author=…&tag=…&sort=oldest&q=…`); reloading shows the same list; *Back* from a post opens it again as it was
- [ ] **4.32 Share a list**: The share button next to ↻: on iOS and iPadOS it opens the share sheet with the list's address; on a computer it copies the address ("Link copied"). Opened by another writer (also on another site of a deployment with sites), it shows the same list
- [ ] **4.33 Sign in from a link**: Signed out, open a list's shared address → *Log in with GitHub*: after signing in, the app opens that list with its filters, not the start page

## Categories and media

- [ ] **5.1 Category tree**: *Categories* shows the categories as a tree, each with how many posts and pages use it
- [ ] **5.2 Add a category**: *Add category* (or a category → *Add a subcategory*): name, address (follows the name), parent → a new term page in one commit, with `url` from `[categories] url_pattern` if set; it appears in the tree and in the editor's category picker
- [ ] **5.3 Delete an unused category**: A category with no posts → *Delete* → confirm: its term page is removed
- [ ] **5.4 Delete a used category**: A used category → *Delete*: the warning names how many posts and pages use it; *Remove from N and delete* takes it out of all of them and removes the term page in one commit; other categories of those posts stay
- [ ] **5.5 Subcategories**: A category with subcategories offers no *Delete*, and says to move or delete those first
- [ ] **5.16 Rename a category**: A used category → *Rename or move* → new name and address → *Save*: one commit moves its term page to the new folder with the old address in `aliases`, renames it in every post, page and draft that had it, and points its subcategories at the new address; the old address on the site redirects to the new one. Someone editing one of those posts blocks it with their name
- [ ] **5.17 Move a category**: *Rename or move* → another parent (itself and its subcategories aren't offered) → *Save*: the tree shows it there; with `[categories] url_pattern` using `{path}`, its and its subcategories' addresses change and the old ones redirect
- [ ] **5.6 Media by month**: *Media* lists months as "Month YYYY" under a heading for each year, newest first, the newest open; each image once (no size variants), with a small thumbnail; tapping one opens the full image
- [ ] **5.7 Loads as needed**: Scrolling down lists older years' months, each with its photo count (also *N of M* with *Used* or *Orphaned*) while still closed; thumbnails load only when a month is opened
- [ ] **5.8 No adding in Media**: *Media* has no way to add photos, only a note that photos are added from a post or page
- [ ] **5.9 Pick from the library**: In a post or page, the photo button → *From media library* → tap two photos (checked, in the order tapped) → *Add 2 photos*: a gallery of their existing addresses at the cursor; one photo → a single image; nothing is copied or uploaded
- [ ] **5.10 Pick from this device**: The photo button → *From this device*: the photo picker of iOS (Photos, camera, files) or the computer's file dialog, as before
- [ ] **5.11 Reuse and publish**: Publish a post that uses a library photo: it shows on the site, and the photo isn't copied again in `MEDIA`
- [ ] **5.12 Used and orphaned**: *Media* → *Used* / *Orphaned*: an open month shows only the photos posts and pages use (or don't), with "N of M" next to the month; a photo used only in the site's home page (`content/_index.md`), a section page or another section's page, a draft, the archive or the Bin, or only through one of its sizes, counts as used; *All* shows everything again
- [ ] **5.13 Usage stays current**: Add an orphaned library photo to a draft and save it (or to a post and publish): back in *Media*, after a moment the photo moves from *Orphaned* to *Used* and the month's counts change; the same after an edit made outside Alasin. Changes only on this device (not saved) don't count
- [ ] **5.14 Delete orphaned photos**: *Media* → *Orphaned* → *Select*: tap two photos (checked) → *Delete (2)* → confirm *Move to Bin*: they leave the list and the counts; in the media bucket the photos and their WebP sizes are gone and are in the drafts bucket under `media-bin/` with the same keys; their addresses no longer load on the site (after any cache expires); *Select* shows only under *Orphaned*, not in the editor's *From media library*
- [ ] **5.15 Photos in the Bin**: The *Bin* shows the deleted photos under *Photos*, with thumbnails, and counts them in the sidebar; tap one → *Recover*: back in the media bucket at the same key, with its sizes, and in *Media*; if a new photo with that key was published meanwhile, it stays in the Bin with a message; tap one → *Delete permanently* → confirm: gone from the drafts bucket; *Empty Bin* deletes photos with the other items

## Galleries and picture texts

- [ ] **G.1 Add to a gallery from the library**: A gallery card's **+** tile → *From media library* → pick two photos → *Add 2 photos*: they are added at the end of that gallery, not at the cursor
- [ ] **G.2 Add to a gallery from this device**: A gallery card's **+** → *From this device* → pick photos: they show in the gallery as empty tiles while uploading, then as photos
- [ ] **G.3 Single image to gallery**: A single image's **+** → pick one or more photos: the image and the new photos become one gallery, the image first
- [ ] **G.4 Toolbar unchanged**: After using a **+**, the toolbar's photo button still adds photos at the cursor
- [ ] **G.5 Picture text shown**: Under each photo (single images and in galleries) its text shows, or *Add text* if it has none
- [ ] **G.6 Edit a picture text**: Tap a picture's text → change it → *Done*: in Markdown mode only that image's line changed (`![](…/photo.jpg "New text")`); an empty text removes the title; quotes in the text survive saving and publishing, and show on the site
- [ ] **G.7 Text follows the photo**: Give a gallery photo a text, then move it (‹ › or drag): the text moves with it
- [ ] **G.8 Someone else editing**: While another person holds the edit lock, texts show but can't be tapped, *Add text* and the **+** buttons are hidden

## Authors

Posts have `author_id` (the GitHub login) and `author` (the name).

- [ ] **A.1 New draft**: *New post* → save: the file has `author:` with your GitHub name and `author_id:` with your login
- [ ] **A.2 Current names**: The lists, the author filter and the editor show each user's current GitHub name with their avatar, also for posts whose `author:` has an older name; the filter has one entry per person
- [ ] **A.3 Name changed on GitHub**: Change your GitHub profile name, reload the app: the lists and editor show the new name at once (no waiting); saving one of your posts changes only its `author:` line, to the new name
- [ ] **A.4 Author picker**: The picker lists people with their `@login`; choosing a user writes both fields; *Someone else* writes the name only and removes `author_id`
- [ ] **A.5 Not a user**: A post whose `author_id` isn't a user (edit one on GitHub) shows its `author:` text, without an avatar, and saving it leaves `author:` as it is
- [ ] **A.6 Mine on Home**: *My drafts* and *My recent posts* follow `author_id`, also for posts with an older name in `author:`
- [ ] **A.7 Author required**: Remove the author of a draft (*Someone else* with an empty name isn't possible; edit the file on GitHub to remove both lines): *Save* and *Publish* say "Choose an author first." and open the details
- [ ] **A.8 Setup**: `npm run setup` on an `alasin.toml` with `# author_field = "author"` commented out turns it on and reports it; one that sets it keeps its value and gets the new description
- [ ] **A.9 New avatar**: Change your picture on GitHub: within about 10 minutes, reloading the app shows the new one in the account sheet, *Users*, the lists and the editor's lock banner, without clearing the browser's data

## Several sites

Only on a deployment with a `sites/` folder and two sites (see Several Sites in the wiki); the test environment has one site, so skip these there.

- [ ] **S.1 Add a site**: `npm run setup -- --add-site <id>` on a deployment with one site: it asks for the existing site's id, moves its settings to `sites/<id>.toml` with their comments, renames its buckets to `MEDIA_<ID>`/`DRAFTS_<ID>`, then asks for the new site's repository, branch, address and buckets; `npm run sites` lists both sites and `npm run deploy` names both
- [ ] **S.2 Choose a site**: Sign in with access to both: the app asks which site; choosing one opens `/<id>/`, the sidebar shows it under the app's name, and after a reload `/` opens it again
- [ ] **S.3 Switch**: In the account sheet, the other site in *Sites* opens it: its posts, drafts, categories, media and Bin, not the first site's
- [ ] **S.4 Kept apart**: A photo added to a draft of one site is in that site's buckets only; a device-only draft of one site isn't listed on the other; the same post path open on both sites doesn't lock the other
- [ ] **S.5 One site only**: Someone with write access to only one of the sites signs in straight to it, without the chooser; the other site's address (`/<other id>/`) opens their own site
- [ ] **S.6 Access lost**: Remove someone from one site's repository: within the hour, that site is gone from their account sheet and refused, and the other still works; remove them from the other too, and they're logged out
