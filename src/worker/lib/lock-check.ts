// SPDX-License-Identifier: MIT
//
// Changes to something another editor has open are refused while they hold
// its edit lock (see locks.ts). The caller's own lock (the lockId it holds)
// doesn't count. The answer names who is editing, never their lockId.

import type { Context } from "hono";
import type { AppEnv } from "../app";

/** A 409 answer if someone else holds the lock `key`; null if the change can go ahead. */
export async function lockedBy(c: Context<AppEnv>, key: string, lockId: string | undefined, what = "this"): Promise<Response | null> {
  const found = await c.env.LOCKS.get(c.env.LOCKS.idFromName("locks")).holderOf(key);
  if (!found || found.lockId === lockId) return null;
  const { lockId: _held, ...holder } = found;
  return c.json({ error: "locked", message: `${holder.name ?? holder.login} is editing ${what}. Try again when they're done.`, holder }, 409);
}
