A test environment is a second Alasin, with a **DEV** badge, writing to the site repository's `dev` branch, with its own Worker, address, buckets, KV namespace, secrets and GitHub App. It's for developing Alasin, running the [manual test runs](Testing.md#manual-test-runs), and trying a new release before production gets it. Nothing done in it reaches the production site.

There are two ways to get one:

- **[A new test site](#a-new-test-site)**: `create-site` makes a site with sample content, on its own or next to a production site. It can be reset to the sample content after each test, and removed.
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

## Next to an existing site

A dev deployment for a site set up with [Existing Site](Existing-Site.md), committing to the site's `dev` branch:

```sh
npm run setup  -- --site my-site --env dev
npm run deploy -- --site my-site --env dev
```

Setup adds `[env.dev]` to both files. Choose its own address (a workers.dev address or another hostname) and the address of your site's dev build. It has no sample content: it shows what's on the `dev` branch.

## Updating it

Update the test environment first, and production once the release works there: [Updating](Updating.md), with `--env dev`.
