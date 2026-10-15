# Prerequisites

Everything to set up in Cloudflare and GitHub **before** running `npm run setup`. It's written for site owners who are comfortable in a terminal but haven't used Wrangler or GitHub Apps before.

Each step is marked **Manual** (you do it) or **Setup** (`npm run setup` does it for you; listed so you know what will happen). At the end there's a checklist of the values setup will ask for.

## 1. Local tools — Manual

- **Node.js LTS** (version 22 or newer) and **npm**, which comes with it. Install from [nodejs.org](https://nodejs.org) or your package manager. Check:

  ```sh
  node --version   # v22.x or newer
  npm --version
  ```

- **git**: `git --version`.
- **Wrangler**, Cloudflare's CLI, comes with Alasin (`npm install` installs the pinned version). Run it as `npx wrangler …`; no global install is needed.

## 2. Cloudflare account

### Account and plan — Manual

Any Cloudflare account works; the **Workers Free plan** is enough for a small site. The limits that matter:

| | Free plan |
| --- | --- |
| Worker requests | 100,000 per day |
| CPU time | 10 ms per request (Alasin does image resizing and search indexing in the browser for this reason) |
| KV | 100,000 reads and 1,000 writes per day (sessions are written about once an hour per user) |
| Durable Objects | SQLite-backed objects are included (used for edit locks) |
| Cron triggers | included (used for the daily cleanup of abandoned draft images) |
| R2 | 10 GB storage and generous monthly operation quotas free |

### Enable R2 — Manual

In the dashboard, open **Storage & databases → R2** and enable it. **Cloudflare asks for a payment method even if you stay within the free tier**; you're only charged beyond the free quotas.

### Your existing media bucket — Manual

Alasin uses the R2 bucket that already serves your site's images (binding `MEDIA`). Under **R2 → Overview**, note:

- the **bucket name**;
- its **jurisdiction**, shown on the bucket's page (for example **EU**). A bucket created with a jurisdiction can only be reached by a binding that names the same jurisdiction, so setup asks for it;
- the bucket's **public custom domain** under the bucket's **Settings → Custom Domains** (e.g. `https://media.example.com/`).

Alasin only adds objects to this bucket. It never overwrites or deletes anything there.

### The private drafts bucket — Setup

Setup creates a second bucket (binding `DRAFTS`, e.g. `example-media-drafts`) in the same jurisdiction. It holds only images of unpublished drafts. Don't give it public access or a custom domain.

### A hostname for the app — Manual

Choose where the app will live:

- a hostname on a domain (zone) in the same Cloudflare account, e.g. `alasin.example.com`. Setup adds it as a Worker **custom domain**; Wrangler creates the DNS record and certificate on deploy. You don't create the DNS record yourself; or
- to start with, the Worker's `workers.dev` address: `https://<worker name>.<your subdomain>.workers.dev`. Find your subdomain under **Workers & Pages → Overview** (right-hand side, "Subdomain").

For a **production and dev** setup, choose one hostname per deployment (e.g. `alasin.example.com` and `alasin-dev.example.com`), and note the URL of your site's dev branch build if it has one.

Check: the zone appears under **Websites** in the same account where Workers runs.

## 3. Wrangler connection — Manual

```sh
npx wrangler login
```

A browser window opens and asks you to allow Wrangler to access your Cloudflare account (Workers, R2, KV and related permissions). Approve it, then confirm:

```sh
npx wrangler whoami
```

It prints your email and the account(s) you can access.

**Several accounts?** If `whoami` lists more than one account, setup asks which one to use and writes its `account_id` into `wrangler.toml`. You can also set `CLOUDFLARE_ACCOUNT_ID` in your shell.

**Headless or CI use:** instead of `wrangler login`, create an API token under **My Profile → API Tokens → Create Token → Custom token** with these permissions, scoped to your account (and zone):

- Account → **Workers Scripts**: Edit
- Account → **Workers R2 Storage**: Edit
- Account → **Workers KV Storage**: Edit
- Account → **Account Settings**: Read
- Zone → **Workers Routes**: Edit, and Zone → **DNS**: Edit (only for a custom domain)

then `export CLOUDFLARE_API_TOKEN=<token>` (and `CLOUDFLARE_ACCOUNT_ID`).

**Logging out afterwards:** `npx wrangler logout`; revoke API tokens on the same API Tokens page.

## 4. GitHub — Manual

- **The site repository:** note its owner and name (`owner/name`) and the branch Cloudflare builds the live site from (usually `main`). The site should already build and deploy on Cloudflare.
- **Public or private?** If the repository is public, anything committed is public, including drafts committed with `draft: true`. Alasin's default (`[drafts] storage = "private"`) keeps draft text out of git until you publish; see `alasin.example.toml`.
- **Every author needs their own GitHub account with write access** to the site repository (as a collaborator, or through an organisation team). Alasin commits with each person's own token, so commits show who wrote what.
- Note everyone's **GitHub username**. Setup turns them into numeric user IDs for the allowlist.

## 5. GitHub App for login

Alasin uses a **GitHub App** (not an OAuth App) installed only on the site repository. It's used for:

- **login**, through the app's OAuth flow;
- **commits as the user**, with short-lived user tokens limited to what both the user and the app may do;
- the daily cleanup's **read-only installation token**.

A GitHub App can be limited to one repository and to exactly the permissions Alasin needs; an OAuth App would get access to every repository the user can reach.

### Automatic — Setup (recommended)

Setup creates the app with GitHub's **App Manifest flow**. In the browser you will:

1. see a short local page and click **Continue to GitHub**;
2. on GitHub, check the name and click **Create GitHub App** (for an organisation-owned repository you must be an owner of the organisation, or ask one to run setup);
3. on the install page that opens next, choose **Only select repositories**, pick the site repository, and click **Install**.

Setup then stores the client secret and private key as Worker secrets and the app's ID, client ID and installation ID in `alasin.toml`.

### Manual

If the manifest flow can't be used, create the app under **Settings → Developer settings → GitHub Apps → New GitHub App** (for an organisation: the organisation's **Settings → Developer settings**):

- **GitHub App name:** anything unique, e.g. "Alasin my-site".
- **Homepage URL:** the app URL, e.g. `https://alasin.example.com`.
- **Callback URL:** `https://<app hostname>/auth/callback`. It must match `[app] url` in `alasin.toml` exactly. Add `http://localhost:8787/auth/callback` too if you'll develop locally.
- **Expire user authorization tokens:** on.
- **Request user authorization (OAuth) during installation:** off.
- **Webhook:** uncheck **Active**.
- **Repository permissions:** **Contents: Read and write**, **Metadata: Read-only**. Nothing else.
- **Where can this GitHub App be installed?** **Only on this account**.

Create it, then:

1. **Install App** → **Only select repositories** → the site repository → **Install**. The installation ID is the number at the end of the page's URL.
2. On the app's page, note the **App ID** and **Client ID**, click **Generate a new client secret**, and under **Private keys** click **Generate a private key** (a `.pem` file downloads).
3. Run `npm run setup` and answer **no** to automatic creation; it asks for these values, converts the key and stores the secrets. Or store them yourself:

   ```sh
   npx wrangler secret put GITHUB_CLIENT_SECRET
   openssl pkcs8 -topk8 -nocrypt -in downloaded-key.pem | npx wrangler secret put GITHUB_APP_PRIVATE_KEY
   ```

   Secrets never go in TOML files or git. Setup also generates `SESSION_KEY` and `TOKEN_KEY`.

Rotating the client secret and private key later: see the README's [Security](README.md#security) section.

## 6. Checklist

Setup asks for these (and finds or creates the rest):

- [ ] Cloudflare account (if your login has several)
- [ ] App URL (custom hostname or `workers.dev` address)
- [ ] Site repository `owner/name` and branch
- [ ] Public site URL for that branch
- [ ] GitHub usernames of everyone allowed to log in
- [ ] `MEDIA` bucket name and jurisdiction
- [ ] Public URL of the `MEDIA` bucket
- [ ] Name for the new `DRAFTS` bucket (a default is suggested)
- [ ] GitHub App: created automatically, or its App ID, client ID, client secret and private key
