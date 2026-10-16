# Changelog

## [0.12.0](https://github.com/oh2th/alasin/compare/v0.11.0...v0.12.0) (2026-10-16)


### ⚠ BREAKING CHANGES

* alasin.toml no longer accepts [users]. Run npm run setup to remove it automatically, or delete the [users] tables by hand. Everyone with write access to the site repository can log in.
* [users] allow no longer accepts author. Run npm run setup to update alasin.toml automatically, or delete the author entries by hand.

### Features

* access from the site repository's collaborators ([#108](https://github.com/oh2th/alasin/issues/108)) ([128bc28](https://github.com/oh2th/alasin/commit/128bc283124c3d49f9672c2ac9d24a205ef3873c))
* archive and Bin folders in the configuration ([#77](https://github.com/oh2th/alasin/issues/77)) ([fd6057a](https://github.com/oh2th/alasin/commit/fd6057adb123320ed13e4b86c7f14f813374b687))
* author and tag filters, tag suggestions ([#93](https://github.com/oh2th/alasin/issues/93)) ([5816223](https://github.com/oh2th/alasin/commit/5816223e4ca9c215299d11b61690b4752e9664d3))
* authors by full name ([#87](https://github.com/oh2th/alasin/issues/87)) ([3c617c7](https://github.com/oh2th/alasin/commit/3c617c7bd653af5a71413d99211bc55ad02446d1))
* delete to the Bin, recover, delete permanently, Empty Bin ([#106](https://github.com/oh2th/alasin/issues/106)) ([eb2e6d1](https://github.com/oh2th/alasin/commit/eb2e6d167256fc798ff54145860f9fb7b7acb013))
* edit published posts and pages ([#90](https://github.com/oh2th/alasin/issues/90)) ([de71697](https://github.com/oh2th/alasin/commit/de7169739a9908a229a7f922c8d107b08cfa7883))
* faster lists, several categories in the filter, all drafts ([#85](https://github.com/oh2th/alasin/issues/85)) ([69a6a4a](https://github.com/oh2th/alasin/commit/69a6a4a9d03b2aa0bed9249ce3e44f827718f923))
* filters on one line, build ID in the sidebar ([#95](https://github.com/oh2th/alasin/issues/95)) ([b873943](https://github.com/oh2th/alasin/commit/b873943013e7b53108483bafd428ee91deffb178))
* full names from GitHub profiles for every allowed user ([#88](https://github.com/oh2th/alasin/issues/88)) ([85d1eaa](https://github.com/oh2th/alasin/commit/85d1eaa95eec870eb8e7e190cfa52aa83dc22eff))
* My drafts on the home screen ([#91](https://github.com/oh2th/alasin/issues/91)) ([aa4507e](https://github.com/oh2th/alasin/commit/aa4507e5f5bf89177ed8e58d03985ad5d2f9f4fa))
* nested categories, shown as a tree ([#80](https://github.com/oh2th/alasin/issues/80)) ([347c137](https://github.com/oh2th/alasin/commit/347c137d3e5671b267b0c4bdf2060c630a55f51f))
* nightly cleanup of the drafts bucket; Discard for never-saved drafts ([#107](https://github.com/oh2th/alasin/issues/107)) ([46e7964](https://github.com/oh2th/alasin/commit/46e7964af15e929f57cd2fc597dff3653eaa0837))
* no [users] section; access only from the site repository ([#110](https://github.com/oh2th/alasin/issues/110)) ([9641879](https://github.com/oh2th/alasin/commit/96418791cd64a9424a66abd057ce8385ec8be29f))
* no author option for users ([#89](https://github.com/oh2th/alasin/issues/89)) ([0b0dafd](https://github.com/oh2th/alasin/commit/0b0dafd13d36a4e9396bdcae385a3cedcf03c624))
* one editor at a time ([#97](https://github.com/oh2th/alasin/issues/97)) ([e167450](https://github.com/oh2th/alasin/commit/e167450f9980fd774390106065a78147507de701))
* Posts and Pages lists with search and filters ([#84](https://github.com/oh2th/alasin/issues/84)) ([6973c4b](https://github.com/oh2th/alasin/commit/6973c4bc3376b573e0c268ff6960859a4fc20c69))
* publish drafts with their photos ([#78](https://github.com/oh2th/alasin/issues/78)) ([96e80dc](https://github.com/oh2th/alasin/commit/96e80dc70fa3f2debed951f3d8a2e4a4940806e4))
* read the site's posts and pages for lists and search ([#83](https://github.com/oh2th/alasin/issues/83)) ([611a516](https://github.com/oh2th/alasin/commit/611a5160246096d9d7898e5bf3a526a674ecab4c))
* round-trip check for existing posts ([#82](https://github.com/oh2th/alasin/issues/82)) ([472174d](https://github.com/oh2th/alasin/commit/472174d071149806de344411362d494007565c74))
* setup adds new configuration sections to alasin.toml ([#79](https://github.com/oh2th/alasin/issues/79)) ([cf85420](https://github.com/oh2th/alasin/commit/cf85420f263d07d26a0400ca4efa85a4ba097b19))
* setup adds new options to existing sections of alasin.toml ([#111](https://github.com/oh2th/alasin/issues/111)) ([80677e0](https://github.com/oh2th/alasin/commit/80677e060ea5ff5a30eff463964a4734b35f4360))
* show authors and who last changed each post ([#86](https://github.com/oh2th/alasin/issues/86)) ([bb5ede9](https://github.com/oh2th/alasin/commit/bb5ede90a76bbe3910852a3ff8af195c734a6f16))
* tell when a new version of the app is deployed ([#94](https://github.com/oh2th/alasin/issues/94)) ([f848de6](https://github.com/oh2th/alasin/commit/f848de63dc4e8e4abdd03b58e92a8ccd26a5c737))
* unpublish, archive and republish ([#101](https://github.com/oh2th/alasin/issues/101)) ([2c84a68](https://github.com/oh2th/alasin/commit/2c84a683cfeaf070c99b30a57c5b7d59c1670f3c))
* Users section and README on users and access ([#104](https://github.com/oh2th/alasin/issues/104)) ([c5d7750](https://github.com/oh2th/alasin/commit/c5d775080cd39b7621e80a18704c6b9e2833f241))


### Bug Fixes

* create the GitHub App as public so every listed user can sign in ([#99](https://github.com/oh2th/alasin/issues/99)) ([6eb05c9](https://github.com/oh2th/alasin/commit/6eb05c9296d5f0e54f684108137117189bc6fe51))
* exact category filter, rename on new address, warn about a taken address ([#92](https://github.com/oh2th/alasin/issues/92)) ([2a80ee5](https://github.com/oh2th/alasin/commit/2a80ee52f137020028f8d6eb23b03926168f9f87))
* lists show who is editing within seconds ([#103](https://github.com/oh2th/alasin/issues/103)) ([cb0765a](https://github.com/oh2th/alasin/commit/cb0765a83a114b4778e12301388e27279356592d))
* notice a freed or taken-over edit lock within seconds ([#102](https://github.com/oh2th/alasin/issues/102)) ([346b03f](https://github.com/oh2th/alasin/commit/346b03fac0efe2b844ed4c1cfb216db6a8c14b3f))
* setup doesn't ask about a user list ([#109](https://github.com/oh2th/alasin/issues/109)) ([86e2e28](https://github.com/oh2th/alasin/commit/86e2e28f5586b32a46e2d343fe9a3695328bd6bc))

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
