// SPDX-License-Identifier: MIT
//
// Local autosave: the text of drafts being edited is kept in IndexedDB while
// typing, so nothing is lost if the tab closes or the phone goes offline. It
// is tied to the signed-in user (and the site, with sites) and removed on
// logout (clearLocalData).
// A GitHub commit happens only on "Save draft".

import { currentSite, siteKey } from "./current-site";

const DB = "alasin-drafts";
const STORE = "drafts";

export interface LocalDraft {
  key: string;
  uid: number;
  /** The site's id, in a deployment with sites. */
  site?: string;
  type: "post" | "page";
  id: string;
  /** Full file text as last edited. */
  content: string;
  /** Blob SHA of the GitHub version the edits started from (null: never saved). */
  baseSha: string | null;
  /** Text last saved to GitHub (to tell whether there are unsaved changes). */
  savedContent: string | null;
  updatedAt: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "key" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).finally(() => db.close()) as Promise<T>;
}

export const localKey = (uid: number, type: string, id: string) => siteKey(`${uid}:${type}:${id}`);

export async function getLocalDraft(uid: number, type: string, id: string): Promise<LocalDraft | undefined> {
  try {
    return await tx<LocalDraft | undefined>("readonly", (s) => s.get(localKey(uid, type, id)));
  } catch {
    return undefined;
  }
}

export async function putLocalDraft(d: Omit<LocalDraft, "key" | "updatedAt" | "site">): Promise<void> {
  const site = currentSite();
  try {
    await tx("readwrite", (s) => s.put({ ...d, ...(site ? { site } : {}), key: localKey(d.uid, d.type, d.id), updatedAt: Date.now() }));
  } catch {
    // Private browsing without IndexedDB: the draft is only in memory.
  }
}

export async function deleteLocalDraft(uid: number, type: string, id: string): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(localKey(uid, type, id)));
  } catch {
    // Nothing stored.
  }
}

export async function listLocalDrafts(uid: number): Promise<LocalDraft[]> {
  try {
    const all = await tx<LocalDraft[]>("readonly", (s) => s.getAll());
    return all.filter((d) => d.uid === uid && (d.site ?? null) === currentSite());
  } catch {
    return [];
  }
}

/** Drafts on this device with changes not yet saved to GitHub. */
export async function unsavedLocalDrafts(uid: number): Promise<LocalDraft[]> {
  return (await listLocalDrafts(uid)).filter((d) => d.content !== d.savedContent);
}
