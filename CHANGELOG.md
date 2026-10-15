# Changelog

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
