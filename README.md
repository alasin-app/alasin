# Alasin

Alasin (Finnish for "anvil") is a web app for writing and publishing pages and posts on a **Hugo site stored in GitHub, hosted on Cloudflare, with images in R2**. It's built for a small group of people who write together and want something as easy as a hosted CMS, especially on iPhone and iPad, without leaving their own Hugo, GitHub and Cloudflare setup. One Alasin can serve several sites.

See it at **[alasin.app](https://alasin.app)**: features, screenshots, and what each release brought.

## Documentation

Everything is in the **[wiki](https://github.com/alasin-app/alasin/wiki)**. Start with:

- **[What's New](https://github.com/alasin-app/alasin/wiki/What's-New)**: the latest features, release by release.
- **[Before You Start](https://github.com/alasin-app/alasin/wiki/Before-You-Start)**: what you need.
- **[New Site](https://github.com/alasin-app/alasin/wiki/New-Site)** or **[Existing Site](https://github.com/alasin-app/alasin/wiki/Existing-Site)**: setting Alasin up for your site. Also see [Several Sites](https://github.com/alasin-app/alasin/wiki/Several-Sites).
- **[Development](https://github.com/alasin-app/alasin/wiki/Development)**: working on Alasin itself, with [CONTRIBUTING.md](CONTRIBUTING.md).

The wiki's source is [`wiki/`](wiki/), published from each release. Every change in detail is in the [release notes](https://github.com/alasin-app/alasin/releases). Ideas and plans are in the [issues](https://github.com/alasin-app/alasin/issues); report vulnerabilities as described in [SECURITY.md](SECURITY.md).

## Licence

[MIT](LICENSE). Runtime dependencies: [Hono](https://hono.dev) (MIT), [Zod](https://zod.dev) (MIT), [smol-toml](https://github.com/squirrelchat/smol-toml) (BSD-3-Clause), [yaml](https://eemeli.org/yaml/) (ISC), [Preact](https://preactjs.com) (MIT), [Lucide](https://lucide.dev) (ISC), [CodeMirror](https://codemirror.net) and [Lezer](https://lezer.codemirror.net) (MIT), [MiniSearch](https://lucaong.github.io/minisearch/) (MIT), [jSquash](https://github.com/jamsinclair/jSquash) WebP (Apache-2.0).

The sample photos in `templates/sample/images/` are not covered by the MIT licence: each keeps its own (public domain, CC0 or CC BY), with its author and source in [`templates/sample/CREDITS.md`](templates/sample/CREDITS.md). The skeleton site's theme, [PaperMod](https://github.com/adityatelange/hugo-PaperMod) (MIT), is fetched when a site is built, not included here.
