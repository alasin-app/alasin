# Prerequisites

What to prepare in Cloudflare and GitHub **before** installing Alasin. It's written for site owners who are comfortable in a terminal but haven't used Wrangler before.

Everything here is done by you, once. The rest — creating the drafts bucket, the GitHub App and the secrets — is done by `npm run setup` during [installation](README.md#installation). At the end there's a checklist of the values setup will ask for.

## 1. Local tools

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 22 or 24 (an LTS release; 24 recommended) | From [nodejs.org](https://nodejs.org) or your package manager |
| npm | 10 or newer | Comes with Node.js |
| git | 2.9 or newer (any current version) | Needed to clone and update Alasin |
| Wrangler | installed by `npm install`, pinned in `package.json` | Cloudflare's CLI; no global install needed, always run it as `npx wrangler …` |
| Web browser | any current one | `npm run setup` opens it to create the GitHub App |

Check the versions (run the last one inside the Alasin folder after `npm install`):

```sh
node --version          # v22.x.x or v24.x.x
npm --version           # 10.x.x or newer
git --version           # git version 2.9 or newer
npx wrangler --version  # 4.x.x
```

`npm run setup` checks the Node.js version and stops with a message if it's too old. If you already have a global Wrangler installed, that's fine, but use `npx wrangler` so the version Alasin was tested with is used.

Alasin is developed on macOS, and its tests run on Linux in CI. On Windows, use WSL.

## 2. Cloudflare account

### Account and plan

Any Cloudflare account works; the **Workers Free plan** is enough for a small site. The limits that matter:

| | Free plan |
| --- | --- |
| Worker requests | 100,000 per day |
| CPU time | 10 ms per request (Alasin does image resizing and search indexing in the browser for this reason) |
| KV | 100,000 reads and 1,000 writes per day (sessions are written about once an hour per user) |
| Durable Objects | SQLite-backed objects are included (used for edit locks) |
| Cron triggers | included (used for the daily cleanup of abandoned draft images) |
| R2 | 10 GB storage and generous monthly operation quotas free |

### Enable R2

In the dashboard, open **Storage & databases → R2** and enable it. **Cloudflare asks for a payment method even if you stay within the free tier**; you're only charged beyond the free quotas.

### Your existing media bucket

Alasin uses the R2 bucket that already serves your site's images (binding `MEDIA`). Under **R2 → Overview**, note:

- the **bucket name**;
- its **jurisdiction**, shown on the bucket's page (for example **EU**). A bucket created with a jurisdiction can only be reached by a binding that names the same jurisdiction, so setup asks for it;
- the bucket's **public custom domain** under the bucket's **Settings → Custom Domains** (e.g. `https://media.example.com/`).

Alasin adds objects to this bucket and never overwrites anything there. An image is removed only when someone deletes it in *Media* (only images no post or page uses); it then waits in the Bin, in Alasin's private drafts bucket, until the Bin is emptied.

### A hostname for the app

Choose where the app will live:

- a hostname on a domain (zone) in the same Cloudflare account, e.g. `alasin.example.com`. Setup adds it as a Worker **custom domain**; Wrangler creates the DNS record and certificate on deploy. You don't create the DNS record yourself; or
- to start with, the Worker's `workers.dev` address: `https://<worker name>.<your subdomain>.workers.dev`. Find your subdomain under **Workers & Pages → Overview** (right-hand side, "Subdomain").

For a **production and dev** setup, choose one hostname per deployment (e.g. `alasin.example.com` and `alasin-dev.example.com`), and note the URL of your site's dev branch build if it has one.

Check: the zone appears under **Websites** in the same account where Workers runs.

### Cloudflare features that add scripts to pages

Some zone features insert their own scripts into every HTML page: **Web Analytics** with automatic setup (a beacon from `static.cloudflareinsights.com`) and **JavaScript detections** for bots (an inline script and `/cdn-cgi/challenge-platform/…`). Alasin's Content-Security-Policy blocks them — Alasin has no trackers — so they do nothing but print errors in the browser console. To avoid that, leave the app's hostname out of them:

- **Web Analytics:** dashboard → Analytics & Logs → Web Analytics → your site → *Manage site* → turn off automatic setup, or add a rule that excludes the app's hostname.
- **JavaScript detections:** dashboard → your zone → Security → Bots → turn off *JavaScript detections* (or Bot Fight Mode) if you don't need it.

## 3. Wrangler connection

```sh
npx wrangler login
```

A browser window opens and asks you to allow Wrangler to access your Cloudflare account (Workers, R2, KV and related permissions). Approve it. The browser then shows that Wrangler is authorized, and the terminal prints `Successfully logged in.` **Close the browser tab and return to the terminal.**

Confirm the login:

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

## 4. GitHub

- **The site repository:** note its owner and name (`owner/name`) and the branch Cloudflare builds the live site from (usually `main`). The site should already build and deploy on Cloudflare.
- **Keep the site repository private (recommended).** Alasin commits drafts to the repository, in a `drafts/` folder, so anyone who can read the repository can read them. Images never go into git; they're stored in R2. To check or change the visibility: the repository's **Settings → General → Danger Zone → Change repository visibility**.
- **Optional:** in the site's Cloudflare build settings (**Workers & Pages → your site → Settings → Build → Build watch paths**), exclude `drafts/*`, so saving a draft doesn't rebuild the site.
- **Every author needs their own GitHub account with write access** to the site repository (as a collaborator, or through an organisation team). Alasin commits with each person's own token, so commits show who wrote what.
- Note everyone's **GitHub username**. Setup turns them into numeric user IDs for the allowlist.
- **Who runs setup:** setup creates a GitHub App for logging in to Alasin and installs it on the site repository, so run it as the repository's owner. If the repository belongs to an organisation, you need to be an owner of the organisation (or ask one to run setup).

## 5. Checklist

Setup asks for these (and finds or creates the rest):

- [ ] Cloudflare account (if your login has several)
- [ ] App URL (custom hostname or `workers.dev` address)
- [ ] Site repository `owner/name` and branch
- [ ] Public site URL for that branch
- [ ] GitHub usernames of everyone allowed to log in
- [ ] `MEDIA` bucket name and jurisdiction
- [ ] Public URL of the `MEDIA` bucket
- [ ] Name for the new `DRAFTS` bucket (a default is suggested)
