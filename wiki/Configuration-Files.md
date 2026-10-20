Each site's configuration lives in its own folder in `deployments/`, named after its site repository. The folder is gitignored, and nothing under it can be committed (the git hooks refuse it).

```text
deployments/
  my-site/
    alasin.toml        the site's Alasin settings (see Configuration)
    wrangler.toml      the Worker's settings: name, buckets, KV, rate limits
    create-site.json   only for a site create-site made: its answers and what it made
    .dev.vars*         only for running Alasin locally (see Development)
    site/              a clone of the site repository (create-site makes it)
```

A site with a [test environment](Test-Environment.md) has it as `[env.dev]` in both files.

## Several sites in one clone

Choose the site with `--site` (or `ALASIN_SITE`):

```sh
npm run sites                      # lists the deployments with their Workers and app addresses
npm run deploy -- --site my-site
```

Without `--site`, the commands use `./alasin.toml`. If there's none and `deployments/` has exactly one site, they use that one and say so; with several, they ask for `--site`.

## Backing up

Apart from `.dev.vars` files, nothing in `deployments/` is secret: Worker secrets stay in Cloudflare. It is untracked, though, so `git clean -x` deletes it. Back up each `alasin.toml`, or keep the configuration in a separate private repository and point the commands at it:

```sh
npm run deploy -- --config ../my-site-alasin/alasin.toml    # or ALASIN_CONFIG=…
```

(`wrangler.toml` is looked up next to that `alasin.toml`; override with `--wrangler-config` or `WRANGLER_CONFIG`.)

Every option of `alasin.toml` is in [Configuration](Configuration.md); the bindings and rate limits of `wrangler.toml` are explained in [`wrangler.example.toml`](https://github.com/alasin-app/alasin/blob/main/wrangler.example.toml).
