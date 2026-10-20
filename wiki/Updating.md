New versions of Alasin are published as [releases](https://github.com/alasin-app/alasin/releases). Read the release notes first and follow any upgrade steps they list. Then, in your `alasin` folder:

```sh
git fetch --tags
git checkout vX.Y.Z
npm install
npm run setup -- --site <site>     # updates alasin.toml (see below)
npm run deploy -- --site <site>
```

`npm run setup` keeps an existing `alasin.toml` in step with `alasin.example.toml`: it updates options that were renamed or removed, and adds sections and options that are new in this version, with their comments, set to their default values (or commented out), so new options are visible without changing what your configuration does. Everything else in the file, including your comments, stays as it is. It lists every change it makes.

Do it for each site in `deployments/` (`npm run sites` lists them). A [test environment](Test-Environment.md) isn't updated from releases: it runs the `dev` branch's code.

Releases are tested before they're published, so production needs only a few checks after updating: sign in, see that the account sheet shows the new version, and open a post.

Breaking changes, which need something done by hand, are marked in the release notes and come with their upgrade steps.
