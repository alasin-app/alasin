Every post and page records who wrote it in two front matter fields (named in `[site] author_field` and `author_id_field`):

```yaml
author: "Octo Cat"     # the name, as last written
author_id: "octocat"   # the GitHub login: who wrote it
```

- **`author_id` identifies the author.** Profile names can change at any time; the login is what Alasin matches avatars, *My drafts*, *My recent posts* and the author filter on. It can be written by hand too.
- **`author` is the name as last written.** The lists and the editor show the author's current GitHub name for their `author_id`, and saving a post writes that name to `author`. Someone who no longer has access keeps the name their posts last had. A post without `author_id` (e.g. by someone without a GitHub account) is shown by its `author` text; choose *Someone else* in the editor's author picker to write a name only.
- **Names are never kept:** Alasin reads them from GitHub every time, so a changed name shows at once.

**Existing posts:** posts written before `author_id` need it added once (for example with a small script that maps each `author` name to a login), so Alasin knows whose they are. Until then they are matched by name.

## Showing authors on the site (optional)

Hugo can show the current GitHub name for `author_id` too. A partial such as `layouts/partials/author.html`:

```go-html-template
{{- $name := .Params.author -}}
{{- with .Params.author_id -}}
  {{- $opts := dict -}}
  {{- with os.Getenv "HUGO_GITHUB_TOKEN" }}{{ $opts = dict "headers" (dict "Authorization" (printf "Bearer %s" .)) }}{{ end -}}
  {{- with try (resources.GetRemote (printf "https://api.github.com/users/%s" .) $opts) -}}
    {{- with .Value }}{{ with . | transform.Unmarshal }}{{ $name = or .name .login $name }}{{ end }}{{ end -}}
  {{- end -}}
{{- end -}}
{{ $name }}
```

It never fails the build: if GitHub doesn't answer, it shows `author`. So that names aren't kept between builds, turn Hugo's download cache off in the site configuration:

```toml
[caches.getresource]
maxAge = 0
```

Without a token GitHub allows 60 requests an hour, so set `HUGO_GITHUB_TOKEN` in the build environment (any token; it needs no permissions). A changed name shows on the site after the next build.
