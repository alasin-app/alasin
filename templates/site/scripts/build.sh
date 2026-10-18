#!/usr/bin/env bash
# Build command for Cloudflare Workers Builds (and `npm run build` locally).
# Production (main) builds for the site's address; other branches build with
# root-relative links, so they work on whatever preview address they get.
set -euo pipefail
cd "$(dirname "$0")/.."

npm ci --no-audit --no-fund
export PATH="$PWD/node_modules/.bin:$PATH"
hugo version
echo "Branch: ${WORKERS_CI_BRANCH:-(unset, building as main)}"

if [ "${WORKERS_CI_BRANCH:-main}" = main ]; then
  hugo --gc --minify
else
  hugo --gc --minify --baseURL /
fi
