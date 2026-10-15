// SPDX-License-Identifier: MIT
import preact from "@preact/preset-vite";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  root: "src/web",
  publicDir: "public",
  plugins: [preact()],
  define: { __ALASIN_VERSION__: JSON.stringify(version) },
  // The image worker loads the WebP encoder on demand, so it's an ES module worker.
  worker: { format: "es" },
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
    // Everything is a separate file: the CSP allows no inline script, and fonts/images stay same-origin.
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    sourcemap: false,
    target: ["safari16", "chrome111", "firefox114", "edge111"],
  },
});
