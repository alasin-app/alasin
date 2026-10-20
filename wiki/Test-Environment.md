A test environment is an Alasin with a **DEV** badge, with its own Worker, address, buckets, KV namespace, secrets and GitHub App, writing to a site that's only for testing. It's for developing Alasin and for the [manual test runs](Testing.md#manual-test-runs), which are done only here, never on production. Nothing done in it reaches the production site.

There are three ways to get one:

- **[A new test site](#a-new-test-site)**: `create-site` makes a dev environment with sample content, on its own or next to a production site, on the site repository's `dev` branch, at `*.workers.dev` addresses. It can be reset to the sample content after each test, and removed.
- **[A test site on its own domains](#a-test-site-on-its-own-domains)**: the same sample content and DEV badge, but as a site of its own on your domains, e.g. for a test environment that continuous deployment updates.
- **[Next to an existing site](#next-to-an-existing-site)**: a dev deployment for a site set up with [Existing Site](Existing-Site.md), on that site's `dev` branch.

## A new test site

Follow [New Site](New-Site.md), with these differences.

**Step 1, decide:** the environments. **dev** makes only the test site; **both** makes a production site and a test site in one go. Adding dev to a site later isn't automatic, so decide now. Domains are needed only for production: the test site uses `*.workers.dev` addresses.

What dev adds:

| | Dev |
| --- | --- |
| Site | `https://dev-<site worker>.<your subdomain>.workers.dev`: the `dev` branch's preview, with **sample content** |
| Alasin app | `https://<alasin>-dev.<your subdomain>.workers.dev`, with a **DEV** badge |
| Photos | bucket `<site>-dev-media`, public `r2.dev` address |
| Drafts' photos | bucket `<site>-dev-drafts` (private) |
| GitHub App for signing in | its own |

With both, Cloudflare's dashboard shows three Workers: the site's (one Worker; the test site is its `dev` branch's preview), and Alasin's production and dev Workers.

**Step 5, `create-site`:**

- *Environments: production, dev or both*: **dev** or **both**.
- *Second author of the dev site's sample posts*: a GitHub login (shows their avatar if they're a collaborator), or Enter for a made-up one.
- The production domains are asked only with both.

It then works through these steps:

1. **Buckets:** created; the dev media bucket gets its public address, the production media bucket (with both) its domain.
2. **Site repository:** created from the skeleton site, with `main` and `dev`, and cloned to `deployments/<site>/site/`.
3. **Site Worker:** created and connected to the repository; with both, given the site's domain. The first builds of `main` and `dev` start. It prints the site addresses.
4. **Dev site's sample content:** sample posts, pages, drafts and photos, committed to `dev`.
5. **Alasin, production (1 of 2)** (with both), then **Alasin, dev (2 of 2)**: setup runs as in New Site, step 5. For the dev app:
   - *Is this right?* also shows the **DEV** badge.
   - *Also allow logins from local development (`http://localhost:8787`)?*: **Y** if you'll run Alasin locally ([Development](Development.md)).
   - *Write … .dev.vars for local development?*: the same.

It's finished when the last line is `✓ <alasin>-dev: deployed`.

**Step 6, check the result:**

1. **The builds:** Cloudflare dashboard → **Workers & Pages → `<site>`** → **Deployments**: `dev`'s build is a version with the `dev` alias. It should succeed within a few minutes.
2. **The test site:** open the dev site's address printed in step 5. It shows the sample posts with photos, and *About* and *Credits* in its menu; *About* lists its two sub-pages.
3. **The dev app:** open `https://<alasin>-dev.<your subdomain>.workers.dev` (also listed in the dashboard). Sign in. It shows the **DEV** badge and the sample content: five posts by two authors, *About* with two sub-pages, a draft post with its photo and a draft page, *An older trip* under *Archived*, *A deleted post* in the Bin, the categories, and in *Media* one photo under *Orphaned*.

Optionally, give the dev GitHub App its own logo: [`icons/alasin-logo-512-dev.png`](https://github.com/alasin-app/alasin/blob/main/icons/alasin-logo-512-dev.png).

### Resetting it

After testing, put the test site back to its sample content:

```sh
npm run create-site -- --site <site> --reset-dev
```

It lists what it will replace and asks for the repository name. The `dev` branch gets `main`'s files plus the sample content in one new commit (what was done in the dev app is undone; history is kept), and the dev buckets get the sample photos again. Production isn't touched. The site clone in `deployments/<site>/site/` must have no uncommitted changes.

### Removing it

```sh
npm run create-site -- --site <site> --remove-dev --dry-run    # the plan only
npm run create-site -- --site <site> --remove-dev              # dev only; production stays
```

It removes the dev Alasin (with its secrets and KV namespace) and its GitHub App, the dev buckets, the repository's `dev` branch and `[env.dev]` in the configuration files, as [Removing a Site](Removing-a-Site.md) describes for the whole site. `main` and production stay. A site made with dev only is removed with `--remove`.

## A test site on its own domains

A dev environment's site is the `dev` branch's preview, and Cloudflare serves previews only on `*.workers.dev` addresses. For a test environment on your own domains, make a **test site**: a site repository of its own, built from its `main` branch, with the sample content and the DEV badge.

Follow [New Site](New-Site.md), with these differences:

- **Step 1, decide:** name the repository after the test site's domain, e.g. `octocat/com.example.dev` for `dev.example.com`, and choose its three domains (site, app and photos).
- **Step 5, `create-site`:** *Environments*: **test**. It asks for a second author of the sample posts, and for the *Test* site's, Alasin's and media domains.

It works through the same steps as for production, and adds the sample content to `main` and its photos to the site's media bucket. Its Alasin shows the **DEV** badge and commits to `main`. Check it as in [step 6 above](#a-new-test-site), on its own domains.

`--reset-dev` resets a test site too: `main`'s `content`, `drafts`, `archive` and `bin` folders go back to the skeleton's plus the sample content, in one new commit (the rest of the site, such as its configuration and theme, stays), and its buckets get the sample photos again. `--remove` removes it like any site `create-site` made.

## Next to an existing site

A dev deployment for a site set up with [Existing Site](Existing-Site.md), committing to the site's `dev` branch:

```sh
npm run setup  -- --site my-site --env dev
npm run deploy -- --site my-site --env dev
```

Setup adds `[env.dev]` to both files. Choose its own address (a workers.dev address or another hostname) and the address of your site's dev build. It has no sample content: it shows what's on the `dev` branch.

## Updating it

A test environment runs the code under test: deploy it from a checkout of the `dev` branch (`npm run deploy -- --site <site> --env dev`, or without `--env dev` for a test site; after `npm run setup` with the same options if the configuration changed). Production is updated only from releases ([Updating](Updating.md)).

### From continuous deployment

The repository's *Deploy* workflow (`.github/workflows/deploy.yml`) can deploy the test environment on every push to `dev`:

1. On GitHub, the Alasin repository → **Settings → Environments → New environment** `dev`. Under *Deployment branches and tags*, allow only `dev`.
2. Its **secrets:** `CLOUDFLARE_API_TOKEN` (a token with the permissions in [Troubleshooting](Troubleshooting.md#without-a-browser-ci)), `CLOUDFLARE_ACCOUNT_ID`, and the whole `alasin.toml` and `wrangler.toml` of the test environment as `ALASIN_TOML` and `WRANGLER_TOML`.
3. Its **variable** `ALASIN_ENV`: `none` for a test site (its configuration as it is); leave it out for a dev environment, which deploys `[env.dev]`.
4. The repository's **variable** `ALASIN_DEPLOY`: `true` turns the workflow on (**Settings → Secrets and variables → Actions → Variables**).

A push to `dev` then deploys; follow it under **Actions → Deploy**. After changing the test environment's configuration, update the two secrets.
