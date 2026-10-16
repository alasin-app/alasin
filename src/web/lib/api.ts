// SPDX-License-Identifier: MIT
// Client for the Worker API. State-changing requests carry the X-Alasin header
// the Worker requires for CSRF protection; the browser adds Origin itself.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** The whole response body. */
    readonly data?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class NetworkError extends Error {
  constructor() {
    super("network");
    this.name = "NetworkError";
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (method !== "GET") headers["X-Alasin"] = "1";
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new NetworkError();
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? "error", data.message ?? res.statusText, data);
  return data as T;
}

export interface Me {
  user: { id: number; login: string; name: string | null; avatar: string };
  version: string;
  environment: string | null;
  site: { url: string };
  housekeeping: { item: "session_keys" | "github_secrets"; lastRotated: string | null; ageDays: number | null }[];
}

/** Removes everything the app stored on this device (local drafts, caches). */
export async function clearLocalData(): Promise<void> {
  try {
    const keep = localStorage.getItem("alasin.language");
    localStorage.clear();
    if (keep) localStorage.setItem("alasin.language", keep);
    sessionStorage.clear();
  } catch {
    // Storage unavailable: nothing to clear.
  }
  try {
    const dbs = (await indexedDB.databases?.()) ?? [];
    await Promise.all(
      dbs
        .filter((d) => d.name?.startsWith("alasin"))
        .map(
          (d) =>
            new Promise<void>((resolve) => {
              const req = indexedDB.deleteDatabase(d.name!);
              req.onsuccess = req.onerror = req.onblocked = () => resolve();
            }),
        ),
    );
  } catch {
    // Older browsers without indexedDB.databases(): the server's Clear-Site-Data covers it.
  }
  try {
    await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  } catch {
    // No Cache Storage.
  }
}
