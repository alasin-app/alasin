What you need before setting up a [New Site](New-Site.md) or Alasin for an [Existing Site](Existing-Site.md). Each step says what you should see; if you don't, see [Troubleshooting](Troubleshooting.md).

## 1. Tools on your computer

| Tool | Version | Check with |
| --- | --- | --- |
| Node.js | 22 or 24 (24 recommended), from [nodejs.org](https://nodejs.org) | `node --version` |
| npm | 10 or newer (comes with Node.js) | `npm --version` |
| git | any current version | `git --version` |
| GitHub CLI, `gh` | any current version, from [cli.github.com](https://cli.github.com) (needed for a new site) | `gh --version` |
| A web browser | any current one | |

Wrangler, Cloudflare's command-line tool, comes with Alasin: always run it as `npx wrangler …`. Alasin is developed on macOS and tested on Linux; on Windows, use WSL.

## 2. Cloudflare

1. **An account.** The free Workers plan is enough for a small site.
2. **R2 enabled.** In the dashboard: **Storage & databases → R2 → enable**. Cloudflare asks for a payment method even within the free tier; you're only charged beyond it.
3. **Your domain on Cloudflare:** the zone (e.g. `example.com`) is listed under **Websites** in the same account.
4. **Log Wrangler in**, in a terminal:

   ```sh
   npx wrangler login
   ```

   A browser window asks you to allow Wrangler access; approve it. The terminal prints `Successfully logged in.` Close the browser tab. Check with `npx wrangler whoami`: it prints your email and account. If it lists several accounts, set the one to use: `export CLOUDFLARE_ACCOUNT_ID=<id>`.

## 3. GitHub

1. **Log the GitHub CLI in** (for a new site):

   ```sh
   gh auth login
   ```

   Choose *GitHub.com*, *HTTPS* (or SSH, as you use git), and log in with the browser. Check with `gh auth status`.
2. **Every author needs their own GitHub account** with write access to the site repository. Alasin commits as the person who wrote the post.

## 4. Alasin

```sh
git clone https://github.com/alasin-app/alasin.git
cd alasin
npm install
```

All commands in this documentation are run in this `alasin` folder.

Next: **[New Site](New-Site.md)** or **[Existing Site](Existing-Site.md)**.
