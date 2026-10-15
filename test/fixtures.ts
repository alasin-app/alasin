// SPDX-License-Identifier: MIT
// Synthetic configuration for tests. Only reserved example values.

import type { AlasinConfigInput } from "../src/shared/config/schema.ts";

export const APP_URL = "https://alasin.example.com";
export const ALLOWED_USER = { login: "octocat", id: 583231 };
export const OTHER_ALLOWED_USER = { login: "hubot", id: 480938 };
export const STRANGER = { login: "mallory", id: 999001 };

export const testConfig: AlasinConfigInput = {
  app: { url: APP_URL },
  site: { url: "https://www.example.com" },
  github: { owner: "example-owner", repo: "example-site", branch: "main", app_id: 12345, client_id: "Iv23liEXAMPLE" },
  users: { allow: [ALLOWED_USER, OTHER_ALLOWED_USER] },
  media: { public_url: "https://media.example.com/" },
  ui: { environment_label: "TEST" },
};

// 32 zero-ish bytes, base64: test-only keys.
export const TEST_SESSION_KEY = btoa(String.fromCharCode(...new Array(32).fill(1)));
export const TEST_TOKEN_KEY = btoa(String.fromCharCode(...new Array(32).fill(2)));
