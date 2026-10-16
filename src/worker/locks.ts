// SPDX-License-Identifier: MIT
// Soft edit locks: one editor at a time per post or page. A SQLite-backed
// Durable Object (one instance for the deployment) so acquire, renew and
// take-over are atomic and immediately consistent.
//
// A lock is a lease held by one open editor (identified by a random lock ID,
// so two tabs of the same user are two holders). The editor renews it every
// `[editor] lock_heartbeat_seconds`; without renewal it expires after
// `lock_expiry_seconds` (closed tab, lost connection, sleeping phone). Locks
// are advisory: saving still checks that the file is unchanged.

import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";

export interface LockHolder {
  uid: number;
  login: string;
  name: string | null;
  /** When this holder took the lock (ms since 1970). */
  since: number;
}

export interface LockInfo extends LockHolder {
  key: string;
  expires: number;
}

export type LockResult = { held: true; expires: number } | { held: false; holder: LockHolder };

interface Row extends Record<string, SqlStorageValue> {
  key: string;
  lock_id: string;
  uid: number;
  login: string;
  name: string | null;
  since: number;
  expires: number;
}

export class EditLocks extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS locks (
      key TEXT PRIMARY KEY,
      lock_id TEXT NOT NULL,
      uid INTEGER NOT NULL,
      login TEXT NOT NULL,
      name TEXT,
      since INTEGER NOT NULL,
      expires INTEGER NOT NULL
    )`);
  }

  private current(key: string, now: number): Row | null {
    const row = this.ctx.storage.sql.exec<Row>("SELECT * FROM locks WHERE key = ?", key).toArray()[0];
    return row && row.expires > now ? row : null;
  }

  private holder(row: Row): LockHolder {
    return { uid: row.uid, login: row.login, name: row.name, since: row.since };
  }

  /** Takes the lock if it's free, expired or already this editor's; `takeOver` takes it from another holder. */
  acquire(key: string, lockId: string, who: { uid: number; login: string; name: string | null }, ttlMs: number, takeOver = false, now = Date.now()): LockResult {
    const row = this.current(key, now);
    if (row && row.lock_id !== lockId && !takeOver) return { held: false, holder: this.holder(row) };
    const since = row && row.lock_id === lockId ? row.since : now;
    const expires = now + ttlMs;
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO locks (key, lock_id, uid, login, name, since, expires) VALUES (?, ?, ?, ?, ?, ?, ?)",
      key,
      lockId,
      who.uid,
      who.login,
      who.name,
      since,
      expires,
    );
    return { held: true, expires };
  }

  /** Extends this editor's lease; if someone else holds the lock now, says who. An expired lock nobody took is taken again. */
  renew(key: string, lockId: string, who: { uid: number; login: string; name: string | null }, ttlMs: number, now = Date.now()): LockResult {
    const row = this.current(key, now);
    if (row && row.lock_id !== lockId) return { held: false, holder: this.holder(row) };
    return this.acquire(key, lockId, who, ttlMs, false, now);
  }

  /** Gives the lock up, if this editor still holds it. */
  release(key: string, lockId: string): void {
    this.ctx.storage.sql.exec("DELETE FROM locks WHERE key = ? AND lock_id = ?", key, lockId);
  }

  /** Every lock currently held. */
  list(now = Date.now()): LockInfo[] {
    this.ctx.storage.sql.exec("DELETE FROM locks WHERE expires <= ?", now);
    return this.ctx.storage.sql
      .exec<Row>("SELECT * FROM locks")
      .toArray()
      .map((r) => ({ key: r.key, ...this.holder(r), expires: r.expires }));
  }
}
