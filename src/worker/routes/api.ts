// SPDX-License-Identifier: MIT
// Authenticated JSON API. Every route requires a valid session; state-changing
// routes are additionally CSRF-checked (see app.ts).

import { Hono } from "hono";
import type { AppEnv } from "../app";
import { requireSession } from "../session";
import { housekeepingDue } from "../../shared/housekeeping";
import { content } from "./content";
import { drafts } from "./drafts";
import { lifecycle } from "./lifecycle";
import { locks } from "./locks";
import { media } from "./media";
import { site } from "./site";
import { users } from "./users";

export const api = new Hono<AppEnv>();

api.use("*", async (c, next) => {
  await next();
  if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "no-store");
});
api.use("*", requireSession());

api.get("/me", (c) => {
  const config = c.get("config");
  const s = c.get("session");
  return c.json({
    user: { id: s.uid, login: s.login, name: s.name, avatar: `/api/avatar/${s.uid}` },
    version: __ALASIN_VERSION__,
    environment: config.ui.environment_label ?? null,
    site: { url: config.site.url },
    housekeeping: housekeepingDue(config),
  });
});

const AVATAR_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const AVATAR_MAX_BYTES = 256 * 1024;

// GitHub avatars are proxied so the CSP doesn't have to allow a third-party origin.
api.get("/avatar/:id{[0-9]{1,12}}", async (c) => {
  const size = c.req.query("s") === "40" ? 40 : 96;
  const upstream = await fetch(`https://avatars.githubusercontent.com/u/${c.req.param("id")}?s=${size}&v=4`, {
    headers: { "User-Agent": "Alasin" },
    cf: { cacheTtl: 86400, cacheEverything: true },
  });
  const type = (upstream.headers.get("Content-Type") ?? "").split(";")[0]!.trim();
  const length = Number(upstream.headers.get("Content-Length") ?? "0");
  if (!upstream.ok || !AVATAR_TYPES.has(type) || length > AVATAR_MAX_BYTES) return c.body(null, 404);
  const body = await upstream.arrayBuffer();
  if (body.byteLength > AVATAR_MAX_BYTES) return c.body(null, 404);
  return c.body(body, 200, { "Content-Type": type, "Cache-Control": "private, max-age=86400" });
});

api.route("/content", content);
api.route("/drafts", drafts);
api.route("/lifecycle", lifecycle);
api.route("/locks", locks);
api.route("/draft-media", media);
api.route("/site", site);
api.route("/users", users);

api.all("*", (c) => c.json({ error: "not_found", message: "No such API route." }, 404));
