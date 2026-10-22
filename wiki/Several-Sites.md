One Alasin deployment can serve several Hugo sites: one address to sign in to, and a list of sites to switch between. Each site keeps its own repository, buckets and settings. A deployment with one site works as before, and can have sites added later.

## How it works

- **Files.** Next to `alasin.toml` is a `sites/` folder with one file per site, `sites/<id>.toml`:

  ```text
  deployments/my-alasin/
    alasin.toml        what every site shares: [app], [ui], [security], the GitHub App
    sites/
      blog.toml        the site "blog": [site], its repository in [github], [media], [drafts] …
      docs.toml
    wrangler.toml      the Worker, with each site's buckets
  ```

  A site's settings are `alasin.toml` merged with its file, so `alasin.toml` can also hold defaults for every site (for example `[images]`). The sections every site shares can only be set in `alasin.toml`. Two sites can't use the same repository and branch. Every option is in [Configuration](Configuration.md).
- **The id** is the file name: lower-case letters, digits and hyphens. It's in the app's addresses for the site (`/blog/posts`), and it names the site's buckets in `wrangler.toml`: `MEDIA_BLOG` and `DRAFTS_BLOG` (hyphens become `_`). Each site has buckets of its own: no bucket can serve two sites.
- **In the app.** After signing in, someone who can write for several sites chooses one. After that, the app opens at the last site used. The current site is shown under the app's name in the sidebar; the account sheet lists the sites to switch between. Drafts and lists kept on a device are kept per site.
- **One GitHub App**, installed on every site's repository. Signing in uses the app itself, so removing one site never stops the others from signing in.

## Adding a site

1. Prepare the new site as for any [existing site](Existing-Site.md): its repository, and its public media bucket with a custom domain.
2. Run setup with the new site's id:

   ```sh
   npm run setup -- --site my-alasin --add-site docs
   ```

   On a deployment with one site, setup first moves that site's own settings from `alasin.toml` to `sites/<its id>.toml` (it asks for the id), keeping their comments, and names its buckets `MEDIA_<ID>` and `DRAFTS_<ID>` in `wrangler.toml`. **Before that, have everyone save the drafts kept only on their devices:** the app keeps device drafts per site, so ones from before aren't shown afterwards. Old addresses of the app's pages open the site's start page.

   Then it makes `sites/docs.toml` from the example and asks for what it needs: the repository, the branch, the site's address and its buckets (creating the private drafts bucket). Edit the rest of the file for the site's layout, as for a new site's `alasin.toml`.
3. **Install the GitHub App on the new site's repository:** on GitHub, open the app (your settings, or the organisation's, → *Developer settings* → *GitHub Apps*), then *Install App*, and add the repository on its owner's account. The app has to be public to be installed on another account (see [Users and Access](Users-and-Access.md)).
4. Deploy: `npm run deploy -- --site my-alasin`. The deploy lists the sites.

`npm run sites` lists each deployment's sites. A plain `npm run setup -- --site my-alasin` goes through every site.

## Access

Everyone with write access to a site's repository can use that site, as with one site. At sign-in, Alasin asks GitHub about every site, and someone who can write for none of them can't sign in. A site someone gets access to later appears the first time they open it, or at their next sign-in. Each site's access is checked again about once an hour; someone who loses it can't use that site any more, and when they have no site left, they're logged out. See [Users and Access](Users-and-Access.md).

## Removing a site

1. Remove its file from `sites/` and its buckets' bindings from `wrangler.toml`, then deploy.
2. Take its repository out of the GitHub App's installation, or uninstall the app on that account.
3. Delete its buckets in Cloudflare once you no longer need them. Drafts committed to its repository stay there.

With one site left, it can stay in `sites/`. The app's addresses then name it.
