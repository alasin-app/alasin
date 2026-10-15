// SPDX-License-Identifier: MIT
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", ".alasin/", ".wrangler/", ".local/", "node_modules/", "coverage/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
    },
  },
  {
    files: ["src/web/**"],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ["src/web/**", "src/worker/**", "src/shared/**"],
    rules: { "no-console": ["error", { allow: ["warn", "error"] }] },
  },
);
