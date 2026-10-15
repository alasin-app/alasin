// SPDX-License-Identifier: MIT
//
// The post and page list, kept in IndexedDB together with the commit it was
// read from. On start the app asks for the branch's head commit (one small
// request) and reads the content again only when the repository has changed,
// including changes made outside Alasin. Removed on logout (clearLocalData).

import { api, NetworkError } from "./api";
import { buildIndex, type ContentIndex } from "./content-index";
import type { SiteSettings } from "./site-types";

const DB = "alasin-content";
const STORE = "index";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function cached(uid: number): Promise<ContentIndex | undefined> {
  try {
    const db = await open();
    return await new Promise<ContentIndex | undefined>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(uid);
      req.onsuccess = () => resolve(req.result as ContentIndex | undefined);
      req.onerror = () => reject(req.error);
    }).finally(() => db.close());
  } catch {
    return undefined;
  }
}

async function store(uid: number, index: ContentIndex): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(STORE, "readwrite");
      t.objectStore(STORE).put(index, uid);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    }).finally(() => db.close());
  } catch {
    // No IndexedDB (e.g. private browsing): read again next time.
  }
}

export interface LoadedContent extends ContentIndex {
  /** True when offline and showing the list as it was last read. */
  stale: boolean;
}

/** The current list: from the cache if the repository hasn't changed, otherwise read again. */
export async function loadContent(uid: number, folders: SiteSettings["folders"], opts: { force?: boolean } = {}): Promise<LoadedContent> {
  const saved = await cached(uid);
  try {
    if (saved && !opts.force) {
      const { commit } = await api<{ commit: string }>("/api/content/head");
      if (commit === saved.commit) return { ...saved, stale: false };
    }
    const index = buildIndex(await api<unknown>("/api/content"), folders);
    await store(uid, index);
    return { ...index, stale: false };
  } catch (err) {
    if (err instanceof NetworkError && saved) return { ...saved, stale: true };
    throw err;
  }
}
