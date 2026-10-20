| You see | Why, and what to do |
| --- | --- |
| `Invalid token` when `create-site` connects Workers Builds | The token is an **account** token. Make it under **My Profile → API Tokens** ([New Site, step 3](New-Site.md#3-create-the-workers-builds-api-token)). |
| `Authentication error` from the Builds API | `CLOUDFLARE_BUILDS_TOKEN` isn't set in this terminal, or lacks the two permissions ([New Site, step 3](New-Site.md#3-create-the-workers-builds-api-token)). |
| A build fails right after *Initializing*: *The build token selected for this build has been deleted or rolled* | The account's chosen build token no longer works. Site Worker → **Settings → Builds → API token**: choose a working one or **Create new token**, then **Retry build** ([New Site, step 4](New-Site.md#4-build-tokens-nothing-to-do-usually)). |
| *Cloudflare's GitHub app must see …* | The app isn't installed on the repository's owner (the organisation, if it's one), or it has *Only select repositories* without the new repository. Fix it on GitHub ([New Site, step 2](New-Site.md#2-let-cloudflare-build-from-github)), then run `npm run create-site -- --site <site>` again: it continues at the Site Worker step. |
| A new domain: *This site can't be reached*, `DNS_PROBE_FINISHED_NXDOMAIN` | Your computer or network still remembers an earlier "not found" for the name. Clear it: in Chrome `chrome://net-internals/#dns` → **Clear host cache**; on macOS `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`. Otherwise it clears by itself within about 30 minutes. |
| *Some of this site already exists, and wasn't made by this deployment* | Something with the planned names is already in your account, possibly a live site. Stop (Enter) and choose other names, unless you mean to reuse it: then it's only reused, never changed. |
| `gh may not delete repositories yet` (removal) | Run `gh auth refresh -h github.com -s delete_repo`, then the same command again. |
| A run stopped half-way | Run the same command again (`--site <site>`): it continues where it stopped. |
| Bucket … not found (setup) | Check the bucket's name and jurisdiction under **R2** in the dashboard ([Existing Site, step 1](Existing-Site.md#1-note-what-setup-will-ask-for)). |
| Errors about scripts from `static.cloudflareinsights.com` or `/cdn-cgi/challenge-platform/` in the browser console | A zone feature (Web Analytics' automatic setup, or *JavaScript detections* for bots) adds scripts that Alasin's security policy blocks. Harmless; to avoid them, leave the app's hostname out of those features (Web Analytics → *Manage site*; Security → Bots). |
| `Wrangler is not logged in` / `R2 isn't enabled` / `Node.js … is too old` | See [Before You Start](Before-You-Start.md). |

## Without a browser (CI)

Instead of `npx wrangler login`, create an API token (**My Profile → API Tokens → Create Token → Custom token**) with Account: **Workers Scripts** Edit, **Workers R2 Storage** Edit, **Workers KV Storage** Edit, **Account Settings** Read, and Zone: **Workers Routes** Edit and **DNS** Edit (for a custom domain); then `export CLOUDFLARE_API_TOKEN=<token>` and `CLOUDFLARE_ACCOUNT_ID`.
