// SPDX-License-Identifier: MIT
// Bindings and secrets the Worker expects. Names must match wrangler.toml
// (see wrangler.example.toml); `npm run setup` creates them.

import type { EditLocks } from "./locks";

export interface Env {
  /** Validated alasin.toml as JSON, injected by `npm run build|dev|deploy`. */
  ALASIN_CONFIG_JSON: string;
  ASSETS: Fetcher;
  /** The site's public image bucket. Read and copy only, never delete or overwrite. */
  MEDIA: R2Bucket;
  /** Private bucket for draft images. */
  DRAFTS: R2Bucket;
  /** Sessions, encrypted GitHub tokens and OAuth state. */
  KV: KVNamespace;
  LOCKS: DurableObjectNamespace<EditLocks>;
  /** Rate limit for login and the OAuth callback, keyed by client IP. */
  RL_AUTH: RateLimit;
  /** Rate limit for uploads, keyed by GitHub user ID. */
  RL_UPLOAD: RateLimit;
  /** Rate limit for commits, keyed by GitHub user ID. */
  RL_COMMIT: RateLimit;

  // Secrets (`npx wrangler secret put <NAME>`), never in TOML or git.
  /** 32 random bytes, base64. Encrypts the session cookie. */
  SESSION_KEY: string;
  /** 32 random bytes, base64. Encrypts GitHub tokens stored in KV. */
  TOKEN_KEY: string;
  GITHUB_CLIENT_SECRET: string;
  /** PKCS#8 PEM. Used for installation tokens (daily cleanup). */
  GITHUB_APP_PRIVATE_KEY: string;
}

type AlasinEnv = Env;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cloudflare {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Env extends AlasinEnv {}
  }
  /** Version from package.json, injected at build time. */
  const __ALASIN_VERSION__: string;
}
