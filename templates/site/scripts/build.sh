#!/usr/bin/env bash
# Build command for Cloudflare Workers Builds (and `npm run build` locally).
# Production (main) builds for the site's address; other branches build with
# root-relative links, so they work on whatever preview address they get, and
# with config/preview/ (e.g. the dev media bucket).
set -euo pipefail
cd "$(dirname "$0")/.."

npm ci --no-audit --no-fund
export PATH="$PWD/node_modules/.bin:$PATH"
hugo version
echo "Branch: ${WORKERS_CI_BRANCH:-(unset, building as main)}"

if [ "${WORKERS_CI_BRANCH:-main}" = main ]; then
  hugo --gc --minify
else
  # Not minified: with root-relative links, PaperMod's breadcrumb JSON-LD is
  # invalid JSON, which the minifier refuses. Search engines don't index previews.
  hugo --gc --baseURL / --environment preview
fi
