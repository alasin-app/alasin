# Alasin

Alasin (Finnish for "anvil") is a web app for writing and publishing pages and posts on a **Hugo site stored in GitHub, hosted on Cloudflare, with images in R2**. It's built for a small group of people who write together and want something as easy as a hosted CMS, especially on iPhone and iPad, without leaving their own Hugo, GitHub and Cloudflare setup.

> **Status: 1.0.** Breaking changes are announced in the release notes with upgrade steps, and `npm run setup` updates `alasin.toml` where it can. Ideas and plans are in the project's [issues](https://github.com/alasin-app/alasin/issues).

## Features

- Login with GitHub only (a GitHub App, with an allowlist of GitHub user IDs); commits are made as the person who wrote them
- iOS-style app that works on iPhone, iPad and any modern desktop browser, in light and dark mode, in English and Finnish
- Runs on the Cloudflare Workers Free plan: one Worker with static assets, R2 for images, KV for sessions, a Durable Object for edit locks
- Uses your site's existing conventions (content folders, image bucket layout, gallery shortcode, image sizes) through configuration
- Drafts of posts and pages, saved in the site repository; photos resized in the browser (with WebP sizes, GPS removed) and uploaded to a private R2 bucket; galleries with the site's own shortcode
- A live-formatting editor on the Markdown itself (formatted text, inline images with their texts, gallery cards you can add photos to, line breaks shown) with a switch to the raw Markdown; posts change only where you edit them
- Coming next: publishing, editing existing posts, edit locks

## Documentation

The documentation is in the project's **[wiki](https://github.com/alasin-app/alasin/wiki)** (its source is [`wiki/`](wiki/)).

**Running a site with Alasin:**

- [Before You Start](https://github.com/alasin-app/alasin/wiki/Before-You-Start): a Cloudflare account with R2 enabled, a GitHub account, Node.js 22 or newer with npm and git, and (for a new site) the GitHub CLI.
- [New Site](https://github.com/alasin-app/alasin/wiki/New-Site): `npm run create-site` creates the site repository (a Hugo site on the PaperMod theme), its buckets, the site's Worker built by Cloudflare Workers Builds, and Alasin itself.
- [Existing Site](https://github.com/alasin-app/alasin/wiki/Existing-Site): for a Hugo site already in a GitHub repository, deployed by Cloudflare, with its images in an R2 bucket: `npm run setup` and `npm run deploy`.
- [Users and Access](https://github.com/alasin-app/alasin/wiki/Users-and-Access), [Authors](https://github.com/alasin-app/alasin/wiki/Authors), [Updating](https://github.com/alasin-app/alasin/wiki/Updating), [Housekeeping](https://github.com/alasin-app/alasin/wiki/Housekeeping), [Removing a Site](https://github.com/alasin-app/alasin/wiki/Removing-a-Site)
- [Configuration](https://github.com/alasin-app/alasin/wiki/Configuration) (every option of `alasin.toml`), [Configuration Files](https://github.com/alasin-app/alasin/wiki/Configuration-Files), [Security](https://github.com/alasin-app/alasin/wiki/Security), [Troubleshooting](https://github.com/alasin-app/alasin/wiki/Troubleshooting)

**Developing and testing Alasin:** [Development](https://github.com/alasin-app/alasin/wiki/Development), [Test Environment](https://github.com/alasin-app/alasin/wiki/Test-Environment), [Testing](https://github.com/alasin-app/alasin/wiki/Testing), and [CONTRIBUTING.md](CONTRIBUTING.md).

Report vulnerabilities as described in [SECURITY.md](SECURITY.md).

## Licence

[MIT](LICENSE). Runtime dependencies: [Hono](https://hono.dev) (MIT), [Zod](https://zod.dev) (MIT), [smol-toml](https://github.com/squirrelchat/smol-toml) (BSD-3-Clause), [Preact](https://preactjs.com) (MIT), [Lucide](https://lucide.dev) (ISC).

The sample photos in `templates/sample/images/` are not covered by the MIT licence: each keeps its own (public domain, CC0 or CC BY), with its author and source in [`templates/sample/CREDITS.md`](templates/sample/CREDITS.md). The skeleton site's theme, [PaperMod](https://github.com/adityatelange/hugo-PaperMod) (MIT), is fetched when a site is built, not included here.
