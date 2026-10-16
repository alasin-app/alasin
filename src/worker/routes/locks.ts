// SPDX-License-Identifier: MIT
//
// Edit locks (see locks.ts). Keys name what is edited: `draft:<draftId>` or
// `file:<repository path>` of a published post or page.
//
//   GET  /api/locks                          the locks held now (for the lists)
//   GET  /api/locks/status?key=&lockId=      {state: "mine" | "free" | "other", holder?}: a cheap check, no write
//   POST /api/locks/acquire {key, lockId, takeOver?}
//   POST /api/locks/renew   {key, lockId}
//   POST /api/locks/release {key, lockId}
//
// acquire and renew answer 200 {held: true, expires} or 409 {held: false, holder}.

import { type Context, Hono } from "hono";
import { z } from "zod";
import type { AlasinConfig } from "../../shared/config/schema";
import { isUlid } from "../../shared/ulid";
import type { AppEnv } from "../app";

function validKey(config: AlasinConfig, key: string): boolean {
  if (key.startsWith("draft:")) return isUlid(key.slice("draft:".length));
  if (!key.startsWith("file:")) return false;
  const path = key.slice("file:".length);
  if (!path.endsWith(".md") || path.split("/").some((s) => s === ".." || s === "." || s === "")) return false;
  return path.startsWith(`${config.site.posts_dir}/`) || path.startsWith(`${config.site.pages_dir}/`);
}

const body = z.strictObject({
  key: z.string().max(600),
  lockId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  takeOver: z.boolean().optional(),
});

const locksFor = (c: Context<AppEnv>) => c.env.LOCKS.get(c.env.LOCKS.idFromName("locks"));

async function parse(c: Context<AppEnv>) {
  const parsed = body.safeParse(await c.req.json().catch(() => undefined));
  return parsed.success && validKey(c.get("config"), parsed.data.key) ? parsed.data : null;
}

export const locks = new Hono<AppEnv>();

locks.get("/", async (c) => c.json({ locks: await locksFor(c).list() }));

locks.get("/status", async (c) => {
  const key = c.req.query("key") ?? "";
  const lockId = c.req.query("lockId") ?? "";
  if (!validKey(c.get("config"), key) || !/^[A-Za-z0-9-]{8,64}$/.test(lockId)) return c.json({ error: "invalid", message: "Invalid request." }, 400);
  const holder = await locksFor(c).holderOf(key);
  if (!holder) return c.json({ state: "free" });
  const { lockId: held, ...who } = holder;
  return c.json(held === lockId ? { state: "mine" } : { state: "other", holder: who });
});

for (const action of ["acquire", "renew"] as const) {
  locks.post(`/${action}`, async (c) => {
    const req = await parse(c);
    if (!req) return c.json({ error: "invalid", message: "Invalid request." }, 400);
    const session = c.get("session");
    const who = { uid: session.uid, login: session.login, name: session.name };
    const ttl = c.get("config").editor.lock_expiry_seconds * 1000;
    const stub = locksFor(c);
    const result = action === "acquire" ? await stub.acquire(req.key, req.lockId, who, ttl, req.takeOver === true) : await stub.renew(req.key, req.lockId, who, ttl);
    return c.json(result, result.held ? 200 : 409);
  });
}

locks.post("/release", async (c) => {
  const req = await parse(c);
  if (!req) return c.json({ error: "invalid", message: "Invalid request." }, 400);
  await locksFor(c).release(req.key, req.lockId);
  return c.json({ released: true });
});
