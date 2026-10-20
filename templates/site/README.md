# Site

A [Hugo](https://gohugo.io/) site written with [Alasin](https://github.com/alasin-app/alasin) and served by a Cloudflare Worker.

## Layout

| Path | What it is |
| --- | --- |
| `content/posts/`, `content/pages/` | Posts and pages. Alasin writes them; they can be edited by hand too. `content/pages/_index.md` puts every top-level page in the main menu. |
| `drafts/`, `archive/`, `bin/` | Alasin's drafts, archived and deleted items. Outside `content/`, so Hugo never builds them. |
| `layouts/` | Alasin's pieces on top of the theme: the gallery shortcode, the image render hook (`/img/…` → the media bucket's URL), and the cover from the `image` field. |
| `hugo.toml` | Site settings. `[params.alasin]` must match `[media]` in Alasin's `alasin.toml`. |
| `go.mod`, `go.sum` | The theme, [PaperMod](https://github.com/adityatelange/hugo-PaperMod), as a Hugo module. |
| `package.json` | Hugo itself (`hugo-extended`), pinned so every build uses the same version. |
| `wrangler.jsonc`, `scripts/build.sh` | The Worker and its build. Cloudflare Workers Builds builds `main` for production and other branches as previews. |

## Working locally

Install [Node.js](https://nodejs.org/) and [Go](https://go.dev/dl/) (Hugo uses Go to fetch the theme), then:

```sh
npm install
npm run dev      # http://localhost:1313
```

## Updating

- **Theme:** `npx hugo mod get -u github.com/adityatelange/hugo-PaperMod`, then commit `go.mod` and `go.sum`.
- **Hugo:** change `hugo-extended` in `package.json`, run `npm install`, and commit `package-lock.json`.
