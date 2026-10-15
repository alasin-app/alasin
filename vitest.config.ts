// SPDX-License-Identifier: MIT
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { parseConfig } from "./src/shared/config/schema.ts";
import { testConfig, TEST_SESSION_KEY, TEST_TOKEN_KEY } from "./test/fixtures.ts";

export default defineConfig({
  define: { __ALASIN_VERSION__: JSON.stringify("0.0.0-test") },
  plugins: [
    cloudflareTest({
      main: "./src/worker/index.ts",
      miniflare: {
        compatibilityDate: "2026-10-01",
        compatibilityFlags: [],
        kvNamespaces: ["KV"],
        r2Buckets: ["MEDIA", "DRAFTS"],
        durableObjects: { LOCKS: { className: "EditLocks", useSQLite: true } },
        ratelimits: {
          RL_AUTH: { namespace_id: "1001", simple: { limit: 5, period: 60 } },
          RL_UPLOAD: { namespace_id: "1002", simple: { limit: 100, period: 60 } },
          RL_COMMIT: { namespace_id: "1003", simple: { limit: 100, period: 60 } },
        },
        bindings: {
          ALASIN_CONFIG_JSON: JSON.stringify(parseConfig(testConfig)),
          SESSION_KEY: TEST_SESSION_KEY,
          TOKEN_KEY: TEST_TOKEN_KEY,
          GITHUB_CLIENT_SECRET: "test-client-secret",
          GITHUB_APP_PRIVATE_KEY: "test-private-key",
        },
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
  },
});
