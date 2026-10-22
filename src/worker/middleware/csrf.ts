// SPDX-License-Identifier: MIT
// CSRF protection for state-changing requests: a custom header (which a
// cross-site form or simple request can't set), a matching Origin, and a JSON
// body. Combined with SameSite=Lax cookies.

import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../app";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const CSRF_HEADER = "X-Alasin";

export function csrf(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) return next();
    const config = c.get("config");
    if (c.req.header(CSRF_HEADER) !== "1") return c.json({ error: "csrf", message: "Missing X-Alasin header." }, 403);
    if (c.req.header("Origin") !== new URL(config.app.url).origin) {
      return c.json({ error: "csrf", message: "Request origin not allowed." }, 403);
    }
    const declaredEmpty = c.req.header("Content-Length") === "0";
    if (c.req.raw.body !== null && !declaredEmpty) {
      const type = (c.req.header("Content-Type") ?? "").split(";")[0]?.trim().toLowerCase();
      // Image uploads send the file itself (also a site's, under /api/sites/<id>/); everything else is JSON.
      const imageUpload =
        c.req.method === "PUT" && /^\/api\/(?:sites\/[^/]+\/)?draft-media\//.test(c.req.path) && /^image\/(jpeg|png|webp|gif)$/.test(type ?? "");
      if (type !== "application/json" && !imageUpload) {
        return c.json({ error: "unsupported_media_type", message: "Expected a JSON body." }, 415);
      }
    }
    return next();
  };
}
