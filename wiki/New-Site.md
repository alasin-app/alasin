For when you have no site yet. Steps 1–4 prepare, and step 5 runs `npm run create-site`, which creates everything a site needs: the site repository (a Hugo site on the PaperMod theme), its buckets, the site's Worker built by Cloudflare Workers Builds, and Alasin. It records each step as it's done (so it can be run again after a stop), and never changes anything it didn't make.

Do [Before You Start](Before-You-Start.md) first. Expect about 30 minutes.

`create-site` can also make a dev site with sample content and its own Alasin, for developing and testing Alasin itself: see [Test Environment](Test-Environment.md). This page sets up only the production site.

## 1. Decide

Before running it, decide:

| | Example | Notes |
| --- | --- | --- |
| **Site repository** | `octocat/my-site` | Your account or an organisation; created **private**. Its name also names the buckets and the site's Worker (`my-site-media`, …). |
| **Alasin name** | `alasin` | The Alasin Worker's name. Must be unused in your Cloudflare account. |
| **Domains** | `www.example.com`, `alasin.example.com`, `media.example.com` | For the site, the app and the photos. All on a zone in your Cloudflare account, and not in use yet. |
| **Jurisdiction** | `none` or `eu` | Where R2 stores the photos. `eu` keeps them in the EU. |

What it makes:

| | |
| --- | --- |
| Site | on your site's domain, built from the repository's `main` branch |
| Alasin app | on your app's domain |
| Photos | bucket `<site>-media`, public on your media domain |
| Drafts' photos | bucket `<site>-drafts` (private) |
| GitHub App for signing in | one, installed only on the site repository |

In Cloudflare's dashboard this shows as two Workers: the site's and Alasin's.

## 2. Let Cloudflare build from GitHub

Cloudflare builds the site from its repository with **Workers Builds**, which uses **Cloudflare's GitHub app**. The app must be installed on **the account that will own the site repository**: for `octocat/my-site` that's `octocat`. If the repository goes to an organisation, the app must be installed on the organisation; having it on your own account isn't enough.

1. On GitHub, open the owner's installed apps:
   - your own account: your profile picture → **Settings → Applications → Installed GitHub Apps**;
   - an organisation: the organisation's **Settings → GitHub Apps** (under *Third-party Access*).
2. Look for **Cloudflare Workers and Pages**.
   - **It's there:** click **Configure**. Under **Repository access**, *All repositories* needs nothing more. With *Only select repositories*, the new repository has to be added once step 5 has created it (`create-site` stops at the Site Worker step until then; see [Troubleshooting](Troubleshooting.md)), or switch to *All repositories* now.
   - **It's not there:** in the Cloudflare dashboard, open **Workers & Pages → Create** → **Import a repository** (or, with an existing Worker: the Worker → **Settings → Builds → Connect**), choose **GitHub**, and when GitHub asks where to install the app, pick **the repository's owner** (the organisation, if it's one). You can cancel the rest afterwards: the app stays installed. Connecting a Worker this way also creates the account's first *build token* (see step 4).

## 3. Create the Workers Builds API token

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

## 4. Build tokens (nothing to do, usually)

Workers Builds deploys with a separate *build token* of the account. Connecting any Worker in the dashboard creates one, and an account can have several, some of them deleted or rolled. When there are several, `create-site` lists them and asks which to use; to see which still work, open any connected Worker → **Settings → Builds → API token**. If none works, create one there (**Create new token**) before step 5.

## 5. Run `create-site`

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
| Environments: production, dev or both [both] | **production** |
| R2 jurisdiction for new buckets (none, eu or fedramp) [none] | |
| Production site's domain, Production Alasin's domain, Production media domain | e.g. `www.example.com`, `alasin.example.com`, `media.example.com` |

It then checks what already exists and prints the **plan**: every repository, bucket, Worker and domain, each with *will be created*. If something already exists that this command didn't make, it warns that this may be a live site and asks you to type the repository name to go on; normally you stop there and choose other names. Your answers are saved in `deployments/<site>/create-site.json` (see [Configuration Files](Configuration-Files.md)).

Answer **y** to *Create the new items (N) now?*. It then works through these steps, each with a heading:

1. **Buckets:** created; the media bucket gets its domain.
2. **Site repository:** created from the skeleton site, and cloned to `deployments/<site>/site/`. It has a `main` branch, which is the site, and a `dev` branch, which Cloudflare builds as a preview at its own address.
3. **Site Worker:** created, given the site's domain, and connected to the repository. If the account has several build tokens, it asks which to use (step 4). The first build starts. It prints the site's address.
4. **Alasin, production (1 of 1)**: Alasin's setup runs in the same terminal:
   - *Is this right?* shows the Worker, address and branch: answer **Y**.
   - *Also allow logins from local development (`http://localhost:8787`)?*: **N**.
   - *Create the GitHub App automatically in your browser (recommended)?*: **Y**, and accept the suggested app name.
   - Your browser opens: click **Continue to GitHub**, then on GitHub **Create GitHub App**.
   - On the install page that opens: choose **Only select repositories**, pick the new site repository, click **Install**. Back in the terminal, press **Enter**: it checks the installation. GitHub can take a few seconds to show a new app; it keeps checking for a while before saying it's not there.
   - *Write … .dev.vars for local development?*: **N**.
   - Then it deploys the Alasin Worker.

It's finished when the last line is `✓ <alasin>: deployed`.

## 6. Check the result

1. **The build:** Cloudflare dashboard → **Workers & Pages → `<site>`** → **Deployments**. The first build of `main` is the production deployment. It should succeed within a few minutes.
2. **The site:** open your site's domain. It shows the empty site.
3. **The app:** open your app's domain → **Sign in with GitHub** → authorise. You see the app and the empty site. Write a first post, publish it, and it appears on the site after the next build.

If a new domain says *This site can't be reached* (`DNS_PROBE_FINISHED_NXDOMAIN`), see [Troubleshooting](Troubleshooting.md).

## 7. Tidy up

- **Delete the Workers Builds API token** (**My Profile → API Tokens**), or let it expire. It's only needed while connecting a site.
- **Invite your authors:** as collaborators with **Write** access on the site repository (see [Users and Access](Users-and-Access.md)). They sign in to the app with GitHub.
- **Back up** `deployments/<site>/` (see [Configuration Files](Configuration-Files.md)).
- Optionally, give the GitHub App a logo: on its settings page, **Display information → Upload a logo**, with [`icons/alasin-logo-512.png`](https://github.com/alasin-app/alasin/blob/main/icons/alasin-logo-512.png).

## Later

- **Run it again** any time with `npm run create-site -- --site <site>`: it asks nothing already answered and continues where a stopped run left off.
- **Update Alasin** when a release appears: [Updating](Updating.md).
- **Remove the site** with everything `create-site` made: [Removing a Site](Removing-a-Site.md).
