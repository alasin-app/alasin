// SPDX-License-Identifier: MIT
//
// The editor's side of the edit lock (one editor at a time). The lock is
// taken when the editor opens, renewed every heartbeat and when the app comes
// back to the foreground, and released when the editor closes (also when the
// tab is closed). If someone else has it, the editor is read-only until the
// user takes over or the lock comes free; if someone takes it over meanwhile,
// it becomes read-only. A cheap status check every 15 seconds notices both
// soon, without writing the lock each time.

import { useEffect, useRef, useState } from "preact/hooks";
import { api, ApiError } from "./api";
import { apiPath } from "./current-site";

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
  void fetch(apiPath("/api/locks/release"), {
    method: "POST",
    keepalive: true,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Alasin": "1" },
    body: JSON.stringify({ key, lockId }),
  }).catch(() => undefined);
}

/** Holds the edit lock for `key` (null: nothing to lock yet). */
/** How often the lock's state is checked (reads only; renewing stays on the heartbeat). */
const CHECK_MS = 15_000;

/**
 * Holds the edit lock for `key` (null: nothing to lock yet). `onRegained` is
 * called when a lock someone else had comes free and this editor takes it, so
 * the text can be read again.
 */
export function useEditLock(
  key: string | null,
  heartbeatSeconds: number,
  onRegained?: () => void,
): LockState & { takeOver: () => Promise<void>; lockId: string } {
  const lockId = useRef(crypto.randomUUID()).current;
  const [lock, setLock] = useState<LockState>({ state: "pending" });
  const current = useRef(lock);
  current.current = lock;
  const onRegainedRef = useRef(onRegained);
  onRegainedRef.current = onRegained;

  /** Asks for the lock (or renews it); true if this editor holds it afterwards. */
  const ask = async (action: "acquire" | "renew", takeOver = false): Promise<boolean> => {
    if (!key) return false;
    try {
      await api<Result>(`/api/locks/${action}`, { method: "POST", body: { key, lockId, ...(takeOver ? { takeOver } : {}) } });
      setLock({ state: "held" });
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const holder = (err.data as { holder?: Holder } | undefined)?.holder;
        if (holder) setLock(action === "renew" || current.current.state === "lost" ? { state: "lost", holder } : { state: "other", holder });
      }
      // Offline or a server error: keep editing; the next heartbeat tries again.
      else if (current.current.state === "pending") setLock({ state: "held" });
      return false;
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
    // Between heartbeats: has someone taken it over, or has it come free?
    const check = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const state = current.current.state;
      if (state === "pending") return;
      try {
        const res = await api<{ state: "mine" | "free" | "other"; holder?: Holder }>(
          `/api/locks/status?key=${encodeURIComponent(key)}&lockId=${encodeURIComponent(lockId)}`,
        );
        if (state === "held" && res.state === "other" && res.holder) setLock({ state: "lost", holder: res.holder });
        // Free again (released or expired): take it; the text is read again, keeping this device's unsaved changes.
        else if ((state === "other" || state === "lost") && res.state === "free") {
          if (await ask("acquire")) onRegainedRef.current?.();
        }
      } catch {
        // Offline: checked again later.
      }
    }, CHECK_MS);
    const onHide = () => release(key, lockId);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(timer);
      clearInterval(check);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onHide);
      release(key, lockId);
    };
  }, [key]);

  return {
    ...lock,
    takeOver: async () => {
      await ask("acquire", true);
    },
    lockId,
  };
}

/** The lock key of a listed post, page or draft. */
export function lockKey(item: { path: string; draftId?: string }): string {
  return item.draftId && item.path.endsWith(`/${item.draftId}.md`) ? `draft:${item.draftId}` : `file:${item.path}`;
}

/** Who is editing what right now (by lock key): checked every 15 seconds while shown, and on coming back to the app. */
export function useLocks(): Map<string, Holder> {
  const [locks, setLocks] = useState<Map<string, Holder>>(new Map());
  useEffect(() => {
    const load = () => {
      if (document.visibilityState !== "visible") return;
      api<{ locks: (Holder & { key: string })[] }>("/api/locks").then(
        (r) => setLocks(new Map(r.locks.map((l) => [l.key, l]))),
        () => undefined,
      );
    };
    load();
    const timer = setInterval(load, CHECK_MS);
    document.addEventListener("visibilitychange", load);
    window.addEventListener("focus", load);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
      window.removeEventListener("focus", load);
    };
  }, []);
  return locks;
}
