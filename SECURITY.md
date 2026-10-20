# Security policy

Alasin can write to a GitHub repository and to the image bucket of a public website, so we take security reports seriously.

## Reporting a vulnerability

Please **don't open a public issue**. Report it privately through GitHub's [private vulnerability reporting](https://github.com/alasin-app/alasin/security/advisories/new) for this repository.

Include what you found, how to reproduce it, and what an attacker could do with it. You'll get an acknowledgement within a week. Once a fix is released, the advisory is published with credit to you, unless you prefer otherwise.

## Supported versions

Only the latest release gets security fixes. Before 1.0, update to the newest 0.x release.

## Scope

In scope: the Alasin Worker, the web app, the setup and deploy scripts, and the default configuration. Out of scope: weaknesses in a deployment's own Cloudflare or GitHub account settings, and findings that need an already-allowed user to attack their own deployment.
