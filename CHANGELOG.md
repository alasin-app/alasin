# Changelog

## [0.11.0](https://github.com/oh2th/alasin/compare/v0.10.3...v0.11.0) (2026-10-15)


### ⚠ BREAKING CHANGES

* [site] timezone is removed. Run npm run setup to update alasin.toml automatically, or delete the timezone line by hand.

### Features

* add photos to drafts, resized in the browser ([#51](https://github.com/oh2th/alasin/issues/51)) ([e5801f6](https://github.com/oh2th/alasin/commit/e5801f6aebf6a5632ceb7e8d901d070ede6da6ba))
* add YouTube videos from the toolbar ([#69](https://github.com/oh2th/alasin/issues/69)) ([6b5ab85](https://github.com/oh2th/alasin/commit/6b5ab85f11a7a491afba849abd02958cae6e3aed))
* choose heading levels 2–5 from the toolbar ([#58](https://github.com/oh2th/alasin/issues/58)) ([ec56261](https://github.com/oh2th/alasin/commit/ec562615e66b1d678e28d5cb49af6ec10c44df13))
* continue lists and quotes on Enter, and pick the cover from the draft's photos ([#49](https://github.com/oh2th/alasin/issues/49)) ([244e7f7](https://github.com/oh2th/alasin/commit/244e7f79bd72b642fb0d3854c182fa5e2cf40c6b))
* create and edit drafts in the app ([#48](https://github.com/oh2th/alasin/issues/48)) ([b305670](https://github.com/oh2th/alasin/commit/b30567092600e20c9708659c91ab111b9e2d0f20))
* Enter in a quote continues it line by line ([#59](https://github.com/oh2th/alasin/issues/59)) ([3dd3d48](https://github.com/oh2th/alasin/commit/3dd3d485218bce1b09cd569456c758800955c812))
* Enter in a quote starts a new paragraph inside the quote ([#54](https://github.com/oh2th/alasin/issues/54)) ([5943d60](https://github.com/oh2th/alasin/commit/5943d6027c3891d7e7f9e721a129e3aa5b8f4286))
* hide the sidebar to icons only ([#71](https://github.com/oh2th/alasin/issues/71)) ([366c7ad](https://github.com/oh2th/alasin/commit/366c7ad0ee9b7a36c6f7249582d32c038a1e5fff))
* keep the environment badge in the hidden sidebar ([#73](https://github.com/oh2th/alasin/issues/73)) ([87d3000](https://github.com/oh2th/alasin/commit/87d3000b3bf21abb5171ae48c8e2c61979c57eaf))
* line breaks and quotes without Shift+Enter ([#60](https://github.com/oh2th/alasin/issues/60)) ([4023e08](https://github.com/oh2th/alasin/commit/4023e08595b85fbe418509c0c9d92c179c60d311))
* live-formatting editor on the Markdown, with a switch to raw Markdown ([#56](https://github.com/oh2th/alasin/issues/56)) ([a73db98](https://github.com/oh2th/alasin/commit/a73db98f1d47dc1061fb3a293ed07a5c582c6741))
* Markdown switch as a toolbar button ([#63](https://github.com/oh2th/alasin/issues/63)) ([226772d](https://github.com/oh2th/alasin/commit/226772d3281e994c7d910f4ff0b76d93b76cff85))
* pasting a YouTube link on its own line adds the video ([#70](https://github.com/oh2th/alasin/issues/70)) ([2194e7f](https://github.com/oh2th/alasin/commit/2194e7f7c578b80f99bd1f77fd0b27e65a34fd69))
* remind the operator to rotate secrets ([#47](https://github.com/oh2th/alasin/issues/47)) ([6a4b8ce](https://github.com/oh2th/alasin/commit/6a4b8ce645790670c2f88fa75a30b6dd27e220a2))
* save drafts to the site repository ([#44](https://github.com/oh2th/alasin/issues/44)) ([5de6359](https://github.com/oh2th/alasin/commit/5de6359ba84a254db24ad55ca4fb034b8a81eb8c))
* sidebar hide/show button at the bottom of the sidebar ([#72](https://github.com/oh2th/alasin/issues/72)) ([1fdea2d](https://github.com/oh2th/alasin/commit/1fdea2df42edc8d67c7aa7d40c8b0f46514f11bf))
* store draft images in the private drafts bucket ([#45](https://github.com/oh2th/alasin/issues/45)) ([f4d35da](https://github.com/oh2th/alasin/commit/f4d35da7e0ebf9bf8104c1d50a29ee3600b6702e))
* store post dates in UTC and show them in the browser's time zone ([#50](https://github.com/oh2th/alasin/issues/50)) ([b015a17](https://github.com/oh2th/alasin/commit/b015a171348240bb3792cc17d6b397b2f5d6df03))
* tidy up empty list items and quote lines when saving a draft ([#53](https://github.com/oh2th/alasin/issues/53)) ([ddd4d55](https://github.com/oh2th/alasin/commit/ddd4d55e40f2e7d564a97a7936e0c7beef90a175))


### Bug Fixes

* end lists and quotes on Enter with iOS keyboards ([#52](https://github.com/oh2th/alasin/issues/52)) ([8cb9a6e](https://github.com/oh2th/alasin/commit/8cb9a6ecd8e83f9f6629efb1d1499d2a2e6b0a65))
* keep the editor toolbar in view with the on-screen keyboard ([#68](https://github.com/oh2th/alasin/issues/68)) ([bf325ea](https://github.com/oh2th/alasin/commit/bf325ea35a78f6306c4cad45b255e5121e55c1f3))
* no blank page after a new deployment ([#55](https://github.com/oh2th/alasin/issues/55)) ([972540a](https://github.com/oh2th/alasin/commit/972540a23fb1a166a3ce3840372b8d9b9750f77e))
* right-align the date in the details form on iOS and iPadOS ([#62](https://github.com/oh2th/alasin/issues/62)) ([5b3fb1f](https://github.com/oh2th/alasin/commit/5b3fb1f7acba6ad468455a1661a04a3c77978137))
* show a Logging out screen right after confirming logout ([#46](https://github.com/oh2th/alasin/issues/46)) ([987dbbe](https://github.com/oh2th/alasin/commit/987dbbee07de8a10c49fdd113c1e2419b560003e))
* show horizontal rules as a line in the editor ([#57](https://github.com/oh2th/alasin/issues/57)) ([7fa06e6](https://github.com/oh2th/alasin/commit/7fa06e64295ca5988b83450c1e792127dd0c7fbd))

## [0.10.3](https://github.com/oh2th/alasin/compare/v0.10.2...v0.10.3) (2026-10-15)


### Bug Fixes

* don't repeat the badge and avatar above the content on wide screens ([#34](https://github.com/oh2th/alasin/issues/34)) ([daa9334](https://github.com/oh2th/alasin/commit/daa933468b9127e7b07d5c332ae060112be021e8))
* setup no longer reads secrets from .dev.vars ([#35](https://github.com/oh2th/alasin/issues/35)) ([11764b4](https://github.com/oh2th/alasin/commit/11764b4f4dc4ae37f1607fbf61289fca641648ae))
* setup reuses GitHub App credentials from .dev.vars for an environment ([#29](https://github.com/oh2th/alasin/issues/29)) ([18e211b](https://github.com/oh2th/alasin/commit/18e211b5563b7b0eee4cfc3a8c53cf7f5ae29968))
* suggest the media bucket's name for the drafts bucket ([#32](https://github.com/oh2th/alasin/issues/32)) ([bfc6ac4](https://github.com/oh2th/alasin/commit/bfc6ac40d01008c119896cc3073d7c22fb78309e))
* turn off the workers.dev address when the app has a custom domain ([#38](https://github.com/oh2th/alasin/issues/38)) ([d79da86](https://github.com/oh2th/alasin/commit/d79da868fcbfda2f058d97079aa9d483c75649f5))
* turn off Workers preview URLs on deploy ([#33](https://github.com/oh2th/alasin/issues/33)) ([d6a4192](https://github.com/oh2th/alasin/commit/d6a41922e63f3ae1a00d0bd5be0ff7888d72b789))

## [0.10.2](https://github.com/oh2th/alasin/compare/v0.10.1...v0.10.2) (2026-10-15)


### Bug Fixes

* setup confirms the Worker name, branch and badge of a deployment ([#25](https://github.com/oh2th/alasin/issues/25)) ([0af16a7](https://github.com/oh2th/alasin/commit/0af16a7843c182fbe6a2d776e3c6ec4c68db2af7))
* stop when npm swallows the options of setup, build, dev or deploy ([#24](https://github.com/oh2th/alasin/issues/24)) ([47a2b8b](https://github.com/oh2th/alasin/commit/47a2b8bb60f2a1c5370b30e9017d2c4eb273e993))

## [0.10.1](https://github.com/oh2th/alasin/compare/v0.10.0...v0.10.1) (2026-10-15)


### Bug Fixes

* setup updates alasin.toml files from older versions ([#20](https://github.com/oh2th/alasin/issues/20)) ([b5eb6c8](https://github.com/oh2th/alasin/commit/b5eb6c8dfa6440fdcf479945ce9992024e15d23c))

## [0.10.0](https://github.com/oh2th/alasin/compare/v0.9.0...v0.10.0) (2026-10-15)


### ⚠ BREAKING CHANGES

* [drafts] storage is removed and [drafts] repo_dir is renamed to [drafts] dir. Upgrade: delete the storage line from alasin.toml and rename repo_dir to dir (or remove it to use the default "drafts").

### Features

* always keep drafts in the site repository ([#14](https://github.com/oh2th/alasin/issues/14)) ([eb61506](https://github.com/oh2th/alasin/commit/eb615069964a0fd57dd896ae5e8ae66411bc2c7b))


### Bug Fixes

* accept bare hostnames in setup's URL questions ([#16](https://github.com/oh2th/alasin/issues/16)) ([2bccdc0](https://github.com/oh2th/alasin/commit/2bccdc0b1c22705c3b660f485ea49771825cba6e))

## 0.9.0 (2026-10-15)


### ⚠ BREAKING CHANGES

* the value "private" of [drafts] storage is renamed to "r2".

### Features

* choose between R2 and a repository directory for draft text ([57b8651](https://github.com/oh2th/alasin/commit/57b86511c3f70e46ad627362efc25247ee9e2252))
* iOS-style app shell with login and account sheet ([f6976d7](https://github.com/oh2th/alasin/commit/f6976d7e9c1d60335db87ea681123581210efe02))
* keep the original file name as the image base name ([06dea24](https://github.com/oh2th/alasin/commit/06dea24d700ec94d29dcd6464a96293a2f3674d2))
* setup, build, dev and deploy commands ([fa75009](https://github.com/oh2th/alasin/commit/fa75009fb980eedab66ce51cfd8636d3252f8d32))
* validated alasin.toml configuration schema ([9825db1](https://github.com/oh2th/alasin/commit/9825db1fece49c7c306f5a9e34d61d014c891fcd))
* worker with GitHub login, sessions and security headers ([7a57e8a](https://github.com/oh2th/alasin/commit/7a57e8ab54d3ccada74de61dc9ed6611e6c6e478))
