// SPDX-License-Identifier: MIT
// Per-deployment settings for the static app shell. They are injected as
// <meta> tags (no inline script, so the CSP stays `script-src 'self'`), so the
// login screen can show the app name, accent colour and environment badge
// before anyone is signed in. None of them is secret.

import type { AlasinConfig } from "../shared/config/schema";

export function withUiSettings(res: Response, config: AlasinConfig): Response {
  const type = res.headers.get("Content-Type") ?? "";
  if (!type.startsWith("text/html")) return res;
  const { ui } = config;
  const title = ui.environment_label ? `${ui.name} (${ui.environment_label})` : ui.name;
  const out = new HTMLRewriter()
    .on("title", {
      element(el) {
        el.setInnerContent(title);
      },
    })
    .on('meta[name="theme-color"]', {
      element(el) {
        el.setAttribute("content", ui.accent_color);
      },
    })
    .on('meta[name="apple-mobile-web-app-title"]', {
      element(el) {
        el.setAttribute("content", ui.name);
      },
    })
    .on("head", {
      element(el) {
        const meta = (name: string, content: string) =>
          `<meta name="${name}" content="${content.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")}">`;
        el.append(
          meta("alasin:name", ui.name) +
            meta("alasin:accent", ui.accent_color) +
            meta("alasin:environment", ui.environment_label ?? "") +
            meta("alasin:language", ui.default_language),
          { html: true },
        );
      },
    })
    .transform(res);
  const headers = new Headers(out.headers);
  // Never keep the app page: it names the current build's script files.
  headers.set("Cache-Control", "no-store");
  headers.delete("ETag");
  return new Response(out.body, { status: out.status, headers });
}

export function webManifest(config: AlasinConfig): Response {
  const { ui } = config;
  const name = ui.environment_label ? `${ui.name} ${ui.environment_label}` : ui.name;
  const manifest = {
    name,
    short_name: name,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F2F2F7",
    theme_color: ui.accent_color,
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-180.png", sizes: "180x180", type: "image/png" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-cache" },
  });
}
