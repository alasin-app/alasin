# Installing Alasin

There are two ways to install Alasin:

| You have… | Follow |
| --- | --- |
| No site yet, or you want a new test site | **[A. A new site](#a-a-new-site)**: one command creates the site repository, the buckets, the site's Worker and Alasin itself, for production, dev or both |
| A Hugo site already deployed on Cloudflare, with its images in R2 | **[B. An existing site](#b-an-existing-site)**: Alasin is set up for your existing repository and media bucket |

Both start with **[Before you start](#before-you-start)**. Each step says what to do, what you should see, and what to do if you don't. Expect about 30 minutes for A, and 20 for B.

## Contents

- [Before you start](#before-you-start)
- [A. A new site](#a-a-new-site)
- [B. An existing site](#b-an-existing-site)
- [Several sites in one clone](#several-sites-in-one-clone)
- [Troubleshooting](#troubleshooting)

## Before you start

### 1. Tools on your computer

| Tool | Version | Check with |
| --- | --- | --- |
| Node.js | 22 or 24 (24 recommended), from [nodejs.org](https://nodejs.org) | `node --version` |
| npm | 10 or newer (comes with Node.js) | `npm --version` |
| git | any current version | `git --version` |
| GitHub CLI, `gh` | any current version, from [cli.github.com](https://cli.github.com) (needed for A) | `gh --version` |
| A web browser | any current one | |

Wrangler, Cloudflare's command-line tool, comes with Alasin: always run it as `npx wrangler …`. Alasin is developed on macOS and tested on Linux; on Windows, use WSL.

### 2. Cloudflare

1. **An account.** The free Workers plan is enough for a small site.
2. **R2 enabled.** In the dashboard: **Storage & databases → R2 → enable**. Cloudflare asks for a payment method even within the free tier; you're only charged beyond it.
3. **Your domain on Cloudflare** (for production): the zone (e.g. `example.com`) is listed under **Websites** in the same account. Development needs no domain: it uses `*.workers.dev` addresses.
4. **Log Wrangler in**, in a terminal:

   ```sh
   npx wrangler login
   ```

   A browser window asks you to allow Wrangler access; approve it. The terminal prints `Successfully logged in.` Close the browser tab. Check with `npx wrangler whoami`: it prints your email and account. If it lists several accounts, set the one to use: `export CLOUDFLARE_ACCOUNT_ID=<id>`.

### 3. GitHub

1. **Log the GitHub CLI in** (for A):

   ```sh
   gh auth login
   ```

   Choose *GitHub.com*, *HTTPS* (or SSH, as you use git), and log in with the browser. Check with `gh auth status`.
2. **Every author needs their own GitHub account** with write access to the site repository. Alasin commits as the person who wrote the post.

### 4. Alasin

```sh
git clone https://github.com/alasin-app/alasin.git
cd alasin
npm install
```

All commands below are run in this `alasin` folder.

## A. A new site

Steps A1–A4 prepare, and A5 runs `npm run create-site`, which creates everything a site needs. It records each step as it's done (so it can be run again after a stop), and never changes anything it didn't make.

### A1. Decide

Before running it, decide:

| | Example | Notes |
| --- | --- | --- |
| **Site repository** | `octocat/my-site` | Your account or an organisation; created **private**. Its name also names the buckets and the site's Worker (`my-site-media`, …). |
| **Alasin name** | `alasin` | The Alasin Worker's name; dev gets `-dev` added (`alasin-dev`). Must be unused in your Cloudflare account. |
| **Environments** | both | **production**, **dev** or **both**. Decide now: adding dev to a site later isn't automatic. |
| **Production domains** | `www.example.com`, `alasin.example.com`, `media.example.com` | For the site, the app and the photos. All on a zone in your Cloudflare account, and not in use yet. Not needed for dev only. |
| **Jurisdiction** | `none` or `eu` | Where R2 stores the photos. `eu` keeps them in the EU. |

What it makes:

| | Production | Dev |
| --- | --- | --- |
| Site | your site's domain, built from `main` | `https://dev-<site worker>.<your subdomain>.workers.dev`, built from `dev`, with **sample content** |
| Alasin app | your app's domain | `https://<alasin>-dev.<your subdomain>.workers.dev`, with a **DEV** badge |
| Photos | bucket `<site>-media` on your media domain | bucket `<site>-dev-media`, public `r2.dev` address |
| Drafts' photos | bucket `<site>-drafts` (private) | bucket `<site>-dev-drafts` (private) |
| GitHub App for signing in | one | its own |

In Cloudflare's dashboard this shows as three Workers: the site's (one Worker; the dev site is its `dev` branch's preview), and Alasin's production and dev Workers (each environment of Alasin is its own Worker, with its own buckets, secrets and GitHub App).

### A2. Let Cloudflare build from GitHub

Cloudflare builds the site from its repository with **Workers Builds**, which uses **Cloudflare's GitHub app**. The app must be installed on **the account that will own the site repository**: for `octocat/my-site` that's `octocat`. If the repository goes to an organisation, the app must be installed on the organisation; having it on your own account isn't enough.

1. On GitHub, open the owner's installed apps:
   - your own account: your profile picture → **Settings → Applications → Installed GitHub Apps**;
   - an organisation: the organisation's **Settings → GitHub Apps** (under *Third-party Access*).
2. Look for **Cloudflare Workers and Pages**.
   - **It's there:** click **Configure**. Under **Repository access**, *All repositories* needs nothing more. With *Only select repositories*, the new repository has to be added once A5 has created it (see A5, step 3), or switch to *All repositories* now.
   - **It's not there:** in the Cloudflare dashboard, open **Workers & Pages → Create** → **Import a repository** (or, with an existing Worker: the Worker → **Settings → Builds → Connect**), choose **GitHub**, and when GitHub asks where to install the app, pick **the repository's owner** (the organisation, if it's one). You can cancel the rest afterwards: the app stays installed. Connecting a Worker this way also creates the account's first *build token* (see A4).

### A3. Create the Workers Builds API token

Workers Builds doesn't accept Wrangler's login: `create-site` needs a **user API token** to connect the repository. You'll use it once.

1. In the Cloudflare dashboard: your profile icon (top right) → **My Profile** → **API Tokens** → **Create Token** → **Create Custom Token** (*Get started*).

   It must be under **My Profile**. A token made under *Manage Account → Account API Tokens* looks the same but is refused with `Invalid token`.
2. **Token name:** `Alasin create-site (Workers Builds)`.
3. **Permissions**, two rows:

   | | | |
   | --- | --- | --- |
   | Account | **Workers Builds Configuration** | **Edit** |
   | Account | **Workers Scripts** | **Read** |

   In the newer permission picker, the same permissions are called **Workers CI** (Edit) and **Workers** (Metadata Read-only). Don't use templates such as *Edit Cloudflare Workers*: they grant much more.
4. **Account Resources:** *Include* → your account.
5. **TTL:** a week or two is enough.
6. **Continue to summary**: exactly those two permissions → **Create Token**. Copy the token (it's shown once).
7. In the terminal, store it for this session only, without it showing on screen or staying in the shell's history:

   ```sh
   read -rs CLOUDFLARE_BUILDS_TOKEN && export CLOUDFLARE_BUILDS_TOKEN
   ```

   Paste the token and press Enter (nothing is shown). Check it:

   ```sh
   curl -s -H "Authorization: Bearer $CLOUDFLARE_BUILDS_TOKEN" \
     https://api.cloudflare.com/client/v4/user/tokens/verify | grep -o '"status":"[a-z]*"'
   ```

   You should see `"status":"active"`. If you see `Invalid API Token` instead, it was made as an account token: make it again under **My Profile**.

Run the following steps in **this same terminal**: the token lasts only there.

### A4. Build tokens (nothing to do, usually)

Workers Builds deploys with a separate *build token* of the account. Connecting any Worker in the dashboard creates one, and an account can have several, some of them deleted or rolled. When there are several, `create-site` lists them and asks which to use; to see which still work, open any connected Worker → **Settings → Builds → API token**. If none works, create one there (**Create new token**) before A5.

### A5. Run `create-site`

```sh
npm run create-site
```

It asks, in this order (press Enter to take the value in brackets):

| Question | Answer |
| --- | --- |
| Site repository on GitHub (owner/name; created private) | e.g. `octocat/my-site` |
| Site title [my-site] | the site's name as shown on it |
| Site language (Hugo locale, e.g. en or fi) [en] | |
| Alasin name (base name of its Cloudflare Worker) [alasin] | |
| Environments: production, dev or both [both] | |
| R2 jurisdiction for new buckets (none, eu or fedramp) [none] | |
| Second author of the dev site's sample posts … | a GitHub login (shows their avatar if they're a collaborator), or Enter for a made-up one. Only with dev. |
| Production site's domain, Production Alasin's domain, Production media domain | e.g. `www.example.com`, `alasin.example.com`, `media.example.com`. Only with production. |

It then checks what already exists and prints the **plan**: every repository, bucket, Worker and domain, each with *will be created*. If something already exists that this command didn't make, it warns that this may be a live site and asks you to type the repository name to go on; normally you stop there and choose other names. Your answers are saved in `deployments/<site>/create-site.json`.

Answer **y** to *Create the new items (N) now?*. It then works through these steps, each with a heading:

1. **Buckets:** created; the dev media bucket gets its public address, the production media bucket its domain.
2. **Site repository:** created from the skeleton site, with `main` and `dev`, and cloned to `deployments/<site>/site/`.
3. **Site Worker:** created, given the site's domain, and connected to the repository. If the account has several build tokens, it asks which to use (A4). The first builds of `main` and `dev` start. It prints the production and dev site addresses.
   - If it stops with *Cloudflare's GitHub app must see …*: the app isn't installed on the repository's owner, or it has *Only select repositories* without the new repository. Fix it on GitHub (A2), then run `npm run create-site -- --site <site>` again. It continues here.
4. **Dev site's sample content** (with dev): sample posts, pages, drafts and photos.
5. **Alasin, production (1 of 2)**, then **Alasin, dev (2 of 2)**: for each, Alasin's setup runs in the same terminal:
   - *Is this right?* shows the Worker, address, branch and badge: answer **Y**.
   - *Also allow logins from local development (`http://localhost:8787`)?*: **N**, unless you'll develop Alasin itself.
   - *Create the GitHub App automatically in your browser (recommended)?*: **Y**, and accept the suggested app name.
   - Your browser opens: click **Continue to GitHub**, then on GitHub **Create GitHub App**.
   - On the install page that opens: choose **Only select repositories**, pick the new site repository, click **Install**. Back in the terminal, press **Enter**: it checks the installation. GitHub can take a few seconds to show a new app; it keeps checking for a while before saying it's not there.
   - *Write … .dev.vars for local development?*: **N**, unless you'll run Alasin locally.
   - Then it deploys that Alasin Worker; the last line is `✓ <worker>: deployed`.

It's finished when the last line is `✓ <alasin>-dev: deployed` (or production's, without dev).

### A6. Check the result

1. **The builds:** Cloudflare dashboard → **Workers & Pages → `<site>`** → **Deployments**. The first build of `main` is the production deployment; `dev`'s is a version with the `dev` alias. Both should succeed within a few minutes.
2. **Production site:** open your site's domain. It shows the empty site.
3. **Dev site:** open the dev site's address printed in A5. It shows the sample posts with photos.
4. **Production app:** open your app's domain → **Sign in with GitHub** → authorise. You see the app with no badge and the empty site.
5. **Dev app:** open `https://<alasin>-dev.<your subdomain>.workers.dev` (also listed in the dashboard). Sign in. It shows the **DEV** badge and the sample content: five posts by two authors, *About* with two sub-pages, a draft post with its photo and a draft page, *An older trip* under *Archived*, *A deleted post* in the Bin, the categories, and in *Media* one photo under *Orphaned*.

If a new domain says *This site can't be reached* (`DNS_PROBE_FINISHED_NXDOMAIN`), see [Troubleshooting](#troubleshooting).

### A7. Tidy up

- **Delete the Workers Builds API token** (**My Profile → API Tokens**), or let it expire. It's only needed while connecting a site.
- **Invite your authors:** as collaborators with **Write** access on the site repository (GitHub → the repository → **Settings → Collaborators**). They sign in to the app with GitHub.

### A8. Later

- **Run it again** any time with `npm run create-site -- --site <site>`: it asks nothing already answered and continues where a stopped run left off.
- **Reset the dev site** to its sample content after testing:

  ```sh
  npm run create-site -- --site <site> --reset-dev
  ```

  It lists what it will replace and asks for the repository name. The `dev` branch gets `main`'s files plus the sample content in one new commit (what was done in the dev app is undone; history is kept), and the dev buckets get the sample photos again. Production isn't touched. The site clone in `deployments/<site>/site/` must have no uncommitted changes.
- **Remove a site** it made, or only its dev environment:

  ```sh
  npm run create-site -- --site <site> --remove --dry-run    # the plan only
  npm run create-site -- --site <site> --remove              # the whole site
  npm run create-site -- --site <site> --remove-dev          # dev only; production stays
  ```

  Only what this site's `create-site` made is removed; anything else is listed as kept. It can't be undone: the photos, and with `--remove` the repository and its history, are deleted. Before anything is removed it checks that `gh` may delete repositories; if not, run `gh auth refresh -h github.com -s delete_repo` first. GitHub can't delete GitHub Apps through its API, so for each app it shows the app's page: click **Delete GitHub App**, confirm with the app's name, and press Enter in the terminal. It keeps checking for a few seconds, since GitHub can be slow to show the app as gone.

## B. An existing site

For a Hugo site that's already in a GitHub repository, built and deployed by Cloudflare, with its images in an R2 bucket.

### B1. Note what setup will ask for

1. **The site repository:** its `owner/name`, and the branch the live site is built from (usually `main`). Keep it **private**: Alasin commits drafts to its `drafts/` folder. Optionally, exclude `drafts/*` from the site's builds (**Workers & Pages → your site → Settings → Build → Build watch paths**), so saving a draft doesn't rebuild the site.
2. **The site's public address** for that branch.
3. **Your media bucket** (Cloudflare dashboard → **R2 → Overview**): its **name**, its **jurisdiction** (shown on the bucket's page, e.g. *EU*), and its **public custom domain** (the bucket's **Settings → Custom Domains**, e.g. `https://media.example.com/`). Alasin adds photos to this bucket and never overwrites anything; a photo is removed only when someone deletes an unused one in *Media*.
4. **An address for the app:** a hostname on a zone in the same Cloudflare account (e.g. `alasin.example.com`; setup adds it as the Worker's custom domain and Wrangler creates its DNS record), or to start with the Worker's `workers.dev` address (`https://<worker>.<your subdomain>.workers.dev`; your subdomain is under **Workers & Pages → Overview**).
5. **Who runs setup:** the repository's owner (for an organisation's repository, an owner of the organisation), since setup creates a GitHub App and installs it on the repository.

### B2. Check your existing posts

Alasin keeps your files exactly as they are, except where you edit them. Check it first, with a checkout of the site repository:

```sh
npm run roundtrip -- ../my-site                 # content directory "content"
npm run roundtrip -- ../my-site site/content    # or another one
```

It opens every Markdown file with the editor's own code and saves it unchanged, in memory only. Any file that doesn't come back byte for byte is listed; please report those as issues.

### B3. Run setup

Keep each site's configuration in its own folder (see [Several sites in one clone](#several-sites-in-one-clone)); name it after the site repository:

```sh
npm run setup -- --site my-site
```

It creates `deployments/my-site/alasin.toml` and `wrangler.toml` and asks for the values from B1, then:

- creates the private **drafts bucket** for photos of unpublished drafts (suggested: your media bucket's name + `-drafts`; every deployment needs its own), in the media bucket's jurisdiction, and the KV namespace for sessions;
- shows the deployment (*Is this right?*: Worker, app address, branch);
- creates the **GitHub App** for signing in. Your browser opens: click **Continue to GitHub**, then **Create GitHub App**; on the install page, choose **Only select repositories**, pick the site repository, **Install**, and press Enter in the terminal;
- stores the app's credentials and new encryption keys as Worker secrets.

It's safe to run again: finished steps are skipped. If the GitHub App can't be created this way, see [Creating the GitHub App by hand](#creating-the-github-app-by-hand).

### B4. Deploy and sign in

```sh
npm run deploy -- --site my-site
```

Open the app's address, sign in with GitHub, and check that your name and avatar appear in the account sheet (tap your avatar).

Optionally, give the GitHub App a logo: on its settings page, **Display information → Upload a logo**, with [`icons/alasin-logo-512.png`](icons/alasin-logo-512.png) (or [`icons/alasin-logo-512-dev.png`](icons/alasin-logo-512-dev.png) for a dev deployment).

### B5. A dev deployment next to production (optional)

A second Alasin, committing to the site's `dev` branch, with its own Worker, address, drafts bucket, KV namespace, secrets and GitHub App, and a **DEV** badge:

```sh
npm run setup  -- --site my-site --env dev
npm run deploy -- --site my-site --env dev
```

Setup adds `[env.dev]` to both files. Choose its own address (a workers.dev address or another hostname) and the address of your site's dev build.

### Creating the GitHub App by hand

Alasin signs users in with a **GitHub App** installed only on the site repository. Setup normally creates it; if it can't, create it under **Settings → Developer settings → GitHub Apps → New GitHub App** (for an organisation: the organisation's **Settings → Developer settings**):

- **GitHub App name:** anything unique, e.g. "Alasin my-site".
- **Homepage URL:** the app's address, e.g. `https://alasin.example.com`.
- **Callback URL:** `https://<app hostname>/auth/callback`, exactly matching `[app] url` in `alasin.toml`. Add `http://localhost:8787/auth/callback` too if you'll develop locally.
- **Expire user authorization tokens:** on. **Request user authorization (OAuth) during installation:** off.
- **Webhook:** uncheck **Active**.
- **Repository permissions:** **Contents: Read and write**, **Metadata: Read-only**. Nothing else.
- **Where can this GitHub App be installed?** **Any account**. With *Only on this account*, everyone except the app's owner gets a 404 page instead of signing in. That's safe: Alasin lets in only people with write access to the site repository, and the app reaches only the repositories it's installed on.

Then:

1. **Install App** → **Only select repositories** → the site repository → **Install**.
2. On the app's page, note the **App ID** and **Client ID**, click **Generate a new client secret**, and under **Private keys** click **Generate a private key** (a `.pem` file downloads).
3. Run `npm run setup -- --site my-site` and answer **no** when it offers to create the app. It asks for these values, converts the key and stores everything as Worker secrets. Secrets never go in TOML files or git.

## Several sites in one clone

Each site's configuration lives in its own folder in `deployments/`, named after its site repository. The folder is gitignored, and nothing under it can be committed (the git hooks refuse it).

```text
deployments/
  my-site/
    alasin.toml        production, plus [env.dev] for a dev deployment
    wrangler.toml
    create-site.json   only for a site create-site made: its answers and what it made
    .dev.vars          only for local `npm run dev`
    site/              a clone of the site repository (create-site makes it)
```

Choose the site with `--site` (or `ALASIN_SITE`):

```sh
npm run sites                                # lists the deployments with their Workers and app addresses
npm run deploy -- --site my-site --env dev
```

Without `--site`, the commands use `./alasin.toml`. If there's none and `deployments/` has exactly one site, they use that one and say so; with several, they ask for `--site`.

Apart from an optional `.dev.vars`, nothing in `deployments/` is secret: Worker secrets stay in Cloudflare. It is untracked, though, so `git clean -x` deletes it. Back up each `alasin.toml`, or keep the configuration in a separate private repository and point the commands at it:

```sh
npm run deploy -- --config ../my-site-alasin/alasin.toml    # or ALASIN_CONFIG=…
```

(`wrangler.toml` is looked up next to that `alasin.toml`; override with `--wrangler-config` or `WRANGLER_CONFIG`.)

## Troubleshooting

| You see | Why, and what to do |
| --- | --- |
| `Invalid token` when `create-site` connects Workers Builds | The token is an **account** token. Make it under **My Profile → API Tokens** (A3). |
| `Authentication error` from the Builds API | `CLOUDFLARE_BUILDS_TOKEN` isn't set in this terminal, or lacks the two permissions (A3). |
| A build fails right after *Initializing*: *The build token selected for this build has been deleted or rolled* | The account's chosen build token no longer works. Site Worker → **Settings → Builds → API token**: choose a working one or **Create new token**, then **Retry build** (A4). |
| *Cloudflare's GitHub app must see …* | Install the app on the repository's owner (the organisation, if it's one), or add the repository to its access on GitHub (A2), then run `create-site` again. |
| A new domain: *This site can't be reached*, `DNS_PROBE_FINISHED_NXDOMAIN` | Your computer or network still remembers an earlier "not found" for the name. Clear it: in Chrome `chrome://net-internals/#dns` → **Clear host cache**; on macOS `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`. Otherwise it clears by itself within about 30 minutes. |
| *Some of this site already exists, and wasn't made by this deployment* | Something with the planned names is already in your account, possibly a live site. Stop (Enter) and choose other names, unless you mean to reuse it: then it's only reused, never changed. |
| `gh may not delete repositories yet` (removal) | Run `gh auth refresh -h github.com -s delete_repo`, then the same command again. |
| A run stopped half-way | Run the same command again (`--site <site>`): it continues where it stopped. |
| Errors about scripts from `static.cloudflareinsights.com` or `/cdn-cgi/challenge-platform/` in the browser console | A zone feature (Web Analytics' automatic setup, or *JavaScript detections* for bots) adds scripts that Alasin's security policy blocks. Harmless; to avoid them, leave the app's hostname out of those features (Web Analytics → *Manage site*; Security → Bots). |
| `Wrangler is not logged in` / `R2 isn't enabled` / `Node.js … is too old` | See [Before you start](#before-you-start). |

**Without a browser (CI):** instead of `npx wrangler login`, create an API token (**My Profile → API Tokens → Create Token → Custom token**) with Account: **Workers Scripts** Edit, **Workers R2 Storage** Edit, **Workers KV Storage** Edit, **Account Settings** Read, and Zone: **Workers Routes** Edit and **DNS** Edit (for a custom domain); then `export CLOUDFLARE_API_TOKEN=<token>` and `CLOUDFLARE_ACCOUNT_ID`.
