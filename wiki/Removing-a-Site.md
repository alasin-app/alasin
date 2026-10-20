`create-site` can remove a site it made, with everything it made for it. (For a site set up with [Existing Site](Existing-Site.md), nothing is removed automatically.)

```sh
npm run create-site -- --site <site> --remove --dry-run    # the plan only
npm run create-site -- --site <site> --remove              # the whole site
```

Only what this site's `create-site` made is removed; anything else is listed as kept. It can't be undone: the photos, the repository and its history are deleted.

- Before anything is removed it checks that `gh` may delete repositories; if not, run `gh auth refresh -h github.com -s delete_repo` first.
- GitHub can't delete GitHub Apps through its API, so for each app it shows the app's page: click **Delete GitHub App**, confirm with the app's name, and press Enter in the terminal. It keeps checking for a few seconds, since GitHub can be slow to show the app as gone.

A site's [test environment](Test-Environment.md) is removed with it. To remove only the test environment and keep production, see [Test Environment](Test-Environment.md#removing-it).
