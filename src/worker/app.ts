// SPDX-License-Identifier: MIT

import { Hono } from "hono";
import type { AlasinConfig } from "../shared/config/schema";
import { loadConfig } from "./config";
import type { Env } from "./env";
import { log, logError } from "./lib/log";
import { csrf } from "./middleware/csrf";
import { withSecurityHeaders } from "./middleware/headers";
import { api } from "./routes/api";
import { auth } from "./routes/auth";
import type { Session } from "./session";
import { SessionExpiredError } from "./session";
import { KeyConfigError } from "./lib/crypto";
import { GitHubError } from "./lib/github";
import { iconPng, iconSvg, PNG_SIZES } from "./icons";
import { webManifest, withUiSettings } from "./shell";

export interface AppEnv {
  Bindings: Env;
  Variables: {
    config: AlasinConfig;
    session: Session;
    requestId: string;
  };
}

export function createApp() {
  const app = new Hono<AppEnv>();

  // Request ID, config, canonical origin, security headers and access logging.
  app.use("*", async (c, next) => {
    const started = Date.now();
    const rid = c.req.header("CF-Ray") ?? crypto.randomUUID();
    c.set("requestId", rid);
    const url = new URL(c.req.url);
    let config: AlasinConfig | undefined;
    try {
      config = loadConfig(c.env.ALASIN_CONFIG_JSON);
    } catch (err) {
      logError({ rid, event: "config_invalid" }, err);
      c.res = withSecurityHeaders(
        new Response("Alasin is not configured correctly. The operator can find details in the Worker logs.", {
          status: 500,
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
        }),
        undefined,
        url.protocol === "https:",
      );
      return;
    }
    c.set("config", config);

    const canonical = new URL(config.app.url);
    if (url.host !== canonical.host || url.protocol !== canonical.protocol) {
      // One origin per deployment: sessions, OAuth and the Origin check depend on it.
      if (c.req.method === "GET" || c.req.method === "HEAD") {
        c.res = withSecurityHeaders(
          Response.redirect(`${canonical.origin}${url.pathname}${url.search}`, 308),
          config,
          canonical.protocol === "https:",
        );
      } else {
        c.res = withSecurityHeaders(new Response("Wrong origin", { status: 421 }), config, true);
      }
      return;
    }

    await next();
    c.res = withSecurityHeaders(c.res, config, canonical.protocol === "https:");
    log({
      rid,
      method: c.req.method,
      route: c.req.routePath,
      status: c.res.status,
      uid: c.var.session?.uid,
      ms: Date.now() - started,
    });
  });

  app.use("/api/*", csrf());
  app.use("/auth/logout", csrf());
  app.route("/auth", auth);
  app.route("/api", api);

  app.get("/manifest.webmanifest", (c) => webManifest(c.get("config")));
  app.get("/icons/icon.svg", (c) =>
    c.body(iconSvg(c.get("config").ui.accent_color), 200, {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400",
    }),
  );
  app.get("/icons/:file{icon-[0-9]+\\.png}", async (c) => {
    const size = Number(c.req.param("file").slice(5, -4));
    if (!(PNG_SIZES as readonly number[]).includes(size)) return c.text("Not found", 404);
    const accent = c.get("config").ui.accent_color;
    const cacheKey = new Request(`${new URL(c.req.url).origin}/icons/icon-${size}.png?accent=${accent.slice(1)}`);
    const cached = await caches.default.match(cacheKey);
    if (cached) return new Response(cached.body, cached);
    const res = new Response(await iconPng(accent, size), {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
    });
    c.executionCtx.waitUntil(caches.default.put(cacheKey, res.clone()));
    return res;
  });

  // Everything else is the single-page app (static assets with SPA fallback).
  app.all("*", async (c) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") return c.text("Method not allowed", 405);
    const res = await c.env.ASSETS.fetch(c.req.raw);
    // A missing build file is a real 404, not the app page: a browser asking for a
    // script that no longer exists (after a deployment) must not get HTML instead.
    if (c.req.path.startsWith("/assets/") && (res.headers.get("Content-Type") ?? "").startsWith("text/html")) {
      return c.text("Not found", 404, { "Cache-Control": "no-store" });
    }
    return withUiSettings(res, c.get("config"));
  });

  app.onError((err, c) => {
    if (err instanceof SessionExpiredError) return c.json({ error: "unauthenticated", message: err.message }, 401);
    if (err instanceof GitHubError && (err.status === 403 || err.status === 404)) {
      logError({ rid: c.get("requestId"), route: c.req.routePath, event: "github_denied" }, err);
      return c.json({ error: "github", message: "GitHub refused the request. Check that you have write access to the site repository." }, 502);
    }
    logError({ rid: c.get("requestId"), route: c.req.routePath, event: err instanceof KeyConfigError ? "secret_invalid" : "unhandled" }, err);
    return c.json({ error: "internal", message: "Something went wrong. Please try again." }, 500);
  });

  return app;
}
