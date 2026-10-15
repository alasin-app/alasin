// SPDX-License-Identifier: MIT
// Security headers on every response, including static assets and redirects.

import type { AlasinConfig } from "../../shared/config/schema";

const cspCache = new WeakMap<AlasinConfig, string>();

/**
 * The Content-Security-Policy. With `styleNonce` (app pages), `<style>` elements
 * carrying that one-time nonce are allowed too — the editor (CodeMirror) adds
 * its styles at runtime. Scripts never get a nonce.
 */
export function contentSecurityPolicy(config: AlasinConfig, styleNonce?: string): string {
  const base = basePolicy(config);
  return styleNonce ? base.replace("style-src 'self'", `style-src 'self' 'nonce-${styleNonce}'`) : base;
}

function basePolicy(config: AlasinConfig): string {
  let csp = cspCache.get(config);
  if (csp) return csp;
  const imgSrc = new Set(["'self'", "blob:", "data:", new URL(config.media.public_url).origin]);
  const styleSrc = new Set(["'self'"]);
  if (config.preview.css_url) styleSrc.add(new URL(config.preview.css_url).origin);
  csp = [
    "default-src 'self'",
    // 'wasm-unsafe-eval' allows compiling WebAssembly (the WebP encoder, needed on
    // browsers that can't encode WebP, e.g. all iOS browsers). It doesn't allow
    // JavaScript eval or inline scripts.
    "script-src 'self' 'wasm-unsafe-eval'",
    `style-src ${[...styleSrc].join(" ")}`,
    `img-src ${[...imgSrc].join(" ")}`,
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; ");
  cspCache.set(config, csp);
  return csp;
}

const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "autoplay=()",
  "browsing-topics=()",
  "camera=()",
  "display-capture=()",
  "geolocation=()",
  "gyroscope=()",
  "hid=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "payment=()",
  "serial=()",
  "usb=()",
].join(", ");

/** Returns a copy of `res` with the security headers set. */
export function withSecurityHeaders(res: Response, config: AlasinConfig | undefined, isHttps: boolean, styleNonce?: string): Response {
  const out = new Response(res.body, res);
  const h = out.headers;
  // Without a valid config there is no media origin to allow; fall back to the strictest policy.
  h.set(
    "Content-Security-Policy",
    config ? contentSecurityPolicy(config, styleNonce) : "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  );
  if (isHttps) h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Permissions-Policy", PERMISSIONS_POLICY);
  h.set("Cross-Origin-Opener-Policy", "same-origin");
  h.set("Cross-Origin-Resource-Policy", "same-origin");
  h.set("X-Frame-Options", "DENY");
  return out;
}
