For a Hugo site that's already in a GitHub repository, built and deployed by Cloudflare, with its images in an R2 bucket. Alasin is set up for your existing repository and media bucket.

Do [Before You Start](Before-You-Start.md) first. Expect about 20 minutes.

## 1. Note what setup will ask for

1. **The site repository:** its `owner/name`, and the branch the live site is built from (usually `main`). Keep it **private**: Alasin commits drafts to its `drafts/` folder. Optionally, exclude `drafts/*` from the site's builds (**Workers & Pages → your site → Settings → Build → Build watch paths**), so saving a draft doesn't rebuild the site.
2. **The site's public address** for that branch.
3. **Your media bucket** (Cloudflare dashboard → **R2 → Overview**): its **name**, its **jurisdiction** (shown on the bucket's page, e.g. *EU*), and its **public custom domain** (the bucket's **Settings → Custom Domains**, e.g. `https://media.example.com/`). Alasin adds photos to this bucket and never overwrites anything; a photo is removed only when someone deletes an unused one in *Media*.
4. **An address for the app:** a hostname on a zone in the same Cloudflare account (e.g. `alasin.example.com`; setup adds it as the Worker's custom domain and Wrangler creates its DNS record), or to start with the Worker's `workers.dev` address (`https://<worker>.<your subdomain>.workers.dev`; your subdomain is under **Workers & Pages → Overview**).
5. **Who runs setup:** the repository's owner (for an organisation's repository, an owner of the organisation), since setup creates a GitHub App and installs it on the repository.

## 2. Check your existing posts

Alasin keeps your files exactly as they are, except where you edit them. Check it first, with a checkout of the site repository:

```sh
npm run roundtrip -- ../my-site                 # content directory "content"
npm run roundtrip -- ../my-site site/content    # or another one
```

It opens every Markdown file with the editor's own code and saves it unchanged, in memory only. Any file that doesn't come back byte for byte is listed; please report those as [issues](https://github.com/alasin-app/alasin/issues).

Posts and pages kept as page bundles (a folder with the text in `index.md` and other files next to it) are edited like any other. Images the bundle refers to by a path of their own are shown in the editor but never changed: one next to `index.md` named in a shortcode's `src` (e.g. `{{< figure src="map.svg" >}}`) or as the cover, and one in another page's bundle by its content path (e.g. `image: "/pages/guide/logo.png"`).

## 3. Run setup

Keep each site's configuration in its own folder (see [Configuration Files](Configuration-Files.md)); name it after the site repository:

```sh
npm run setup -- --site my-site
```

It creates `deployments/my-site/alasin.toml` and `wrangler.toml` and asks for the values from step 1, then:

- creates the private **drafts bucket** for photos of unpublished drafts (suggested: your media bucket's name + `-drafts`; every deployment needs its own), in the media bucket's jurisdiction, and the KV namespace for sessions;
- shows the deployment (*Is this right?*: Worker, app address, branch);
- asks *Also allow logins from local development?*: **N**;
- creates the **GitHub App** for signing in. Your browser opens: click **Continue to GitHub**, then **Create GitHub App**; on the install page, choose **Only select repositories**, pick the site repository, **Install**, and press Enter in the terminal (it keeps checking for a few seconds, since GitHub can be slow to show a new app);
- stores the app's credentials and new encryption keys as Worker secrets;
- asks *Write … .dev.vars for local development?*: **N**.

It's safe to run again: finished steps are skipped. If the GitHub App can't be created this way, see [Creating the GitHub App by hand](#creating-the-github-app-by-hand).

Your site's own settings, such as its folders, image sizes and gallery shortcode, are in `alasin.toml`: see [Configuration](Configuration.md).

## 4. Deploy and sign in

```sh
npm run deploy -- --site my-site
```

Open the app's address, sign in with GitHub, and check that your name and avatar appear in the account sheet (tap your avatar).

Optionally, give the GitHub App a logo: on its settings page, **Display information → Upload a logo**, with [`icons/alasin-logo-512.png`](https://github.com/alasin-app/alasin/blob/main/icons/alasin-logo-512.png).

Then invite your authors ([Users and Access](Users-and-Access.md)), and if your posts don't have an `author_id` yet, see [Authors](Authors.md).

## Creating the GitHub App by hand

Alasin signs users in with a **GitHub App** installed only on the site repository. Setup normally creates it; if it can't, create it under **Settings → Developer settings → GitHub Apps → New GitHub App** (for an organisation: the organisation's **Settings → Developer settings**):

- **GitHub App name:** anything unique, e.g. "Alasin my-site".
- **Homepage URL:** the app's address, e.g. `https://alasin.example.com`.
- **Callback URL:** `https://<app hostname>/auth/callback`, exactly matching `[app] url` in `alasin.toml`.
- **Expire user authorization tokens:** on. **Request user authorization (OAuth) during installation:** off.
- **Webhook:** uncheck **Active**.
- **Repository permissions:** **Contents: Read and write**, **Metadata: Read-only**. Nothing else.
- **Where can this GitHub App be installed?** **Any account**. With *Only on this account*, everyone except the app's owner gets a 404 page instead of signing in. That's safe: Alasin lets in only people with write access to the site repository, and the app reaches only the repositories it's installed on.

Then:

1. **Install App** → **Only select repositories** → the site repository → **Install**.
2. On the app's page, note the **App ID** and **Client ID**, click **Generate a new client secret**, and under **Private keys** click **Generate a private key** (a `.pem` file downloads).
3. Run `npm run setup -- --site my-site` and answer **no** when it offers to create the app. It asks for these values, converts the key and stores everything as Worker secrets. Secrets never go in TOML files or git.
