// SPDX-License-Identifier: MIT
//
// The editor's side of the edit lock (one editor at a time). The lock is
// taken when the editor opens, renewed every heartbeat and when the app comes
// back to the foreground, and released when the editor closes (also when the
// tab is closed). If someone else has it, the editor is read-only until the
// user takes over; if someone takes it over meanwhile, it becomes read-only.

import { useEffect, useRef, useState } from "preact/hooks";
import { api, ApiError } from "./api";

export interface Holder {
  uid: number;
  login: string;
  name: string | null;
  since: number;
}

export type LockState =
  | { state: "pending" }
  | { state: "held" }
  /** Someone else is editing: read-only. */
  | { state: "other"; holder: Holder }
  /** Someone took over while this editor was open: read-only. */
  | { state: "lost"; holder: Holder };

type Result = { held: true; expires: number } | { held: false; holder: Holder };

/** Releases a lock even while the page is closing (keepalive), with the headers every change needs. */
function release(key: string, lockId: string): void {
  void fetch("/api/locks/release", {
    method: "POST",
    keepalive: true,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Alasin": "1" },
    body: JSON.stringify({ key, lockId }),
  }).catch(() => undefined);
}

/** Holds the edit lock for `key` (null: nothing to lock yet). */
export function useEditLock(key: string | null, heartbeatSeconds: number): LockState & { takeOver: () => Promise<void>; lockId: string } {
  const lockId = useRef(crypto.randomUUID()).current;
  const [lock, setLock] = useState<LockState>({ state: "pending" });
  const current = useRef(lock);
  current.current = lock;

  const ask = async (action: "acquire" | "renew", takeOver = false) => {
    if (!key) return;
    try {
      await api<Result>(`/api/locks/${action}`, { method: "POST", body: { key, lockId, ...(takeOver ? { takeOver } : {}) } });
      setLock({ state: "held" });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const holder = (err.data as { holder?: Holder } | undefined)?.holder;
        if (holder) setLock(action === "renew" || current.current.state === "lost" ? { state: "lost", holder } : { state: "other", holder });
      }
      // Offline or a server error: keep editing; the next heartbeat tries again.
      else if (current.current.state === "pending") setLock({ state: "held" });
    }
  };

  useEffect(() => {
    if (!key) return;
    void ask("acquire");
    const timer = setInterval(() => {
      if (current.current.state === "held" && document.visibilityState === "visible") void ask("renew");
    }, heartbeatSeconds * 1000);
    // Back from the background (e.g. a sleeping phone): the lease may have run out.
    const onVisible = () => {
      if (document.visibilityState === "visible" && current.current.state === "held") void ask("renew");
    };
    const onHide = () => release(key, lockId);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onHide);
      release(key, lockId);
    };
  }, [key]);

  return { ...lock, takeOver: () => ask("acquire", true), lockId };
}

/** The lock key of a listed post, page or draft. */
export function lockKey(item: { path: string; draftId?: string }): string {
  return item.draftId && item.path.endsWith(`/${item.draftId}.md`) ? `draft:${item.draftId}` : `file:${item.path}`;
}

/** Who is editing what right now (by lock key), refreshed every minute while shown. */
export function useLocks(): Map<string, Holder> {
  const [locks, setLocks] = useState<Map<string, Holder>>(new Map());
  useEffect(() => {
    const load = () =>
      api<{ locks: (Holder & { key: string })[] }>("/api/locks").then(
        (r) => setLocks(new Map(r.locks.map((l) => [l.key, l]))),
        () => undefined,
      );
    void load();
    const timer = setInterval(() => document.visibilityState === "visible" && void load(), 60_000);
    return () => clearInterval(timer);
  }, []);
  return locks;
}
