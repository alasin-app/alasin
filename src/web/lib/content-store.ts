// SPDX-License-Identifier: MIT
//
// The post and page list, kept in IndexedDB together with the commit it was
// read from. The lists show the kept copy at once and bring it up to date in
// the background: if the branch has moved (also by changes made outside
// Alasin), only the files changed since that commit are read again. The whole
// content is read only the first time, after a big change, or on request.
// Removed on logout (clearLocalData).

import { api, NetworkError } from "./api";
import { buildIndex, type ChangedFile, changedPaths, type ContentIndex, type ContentItem, imagesIn, INDEX_VERSION, type IndexSettings, itemFromFile, reusable, settingsKey } from "./content-index";

const DB = "alasin-content";
const STORE = "index";
/** GitHub's compare lists at most this many files; with more, read everything. */
const COMPARE_LIMIT = 300;
const BATCH = 100;


function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** The list as last read on this device, if any. */
export async function cachedContent(uid: number): Promise<ContentIndex | undefined> {
  try {
    const db = await open();
    return await new Promise<ContentIndex | undefined>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(uid);
      // A copy kept by an older version lacks newer fields: read again.
      req.onsuccess = () => resolve((req.result as ContentIndex | undefined)?.version === INDEX_VERSION ? (req.result as ContentIndex) : undefined);
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

async function readAll(site: IndexSettings): Promise<ContentIndex> {
  return buildIndex(await api<unknown>("/api/content"), site);
}

/** The cached list with only the changed files read again; null if that isn't possible. */
async function readChanges(current: ContentIndex, head: string, site: IndexSettings): Promise<ContentIndex | null> {
  let compare: { files?: ChangedFile[] };
  try {
    compare = await api<{ files?: ChangedFile[] }>(`/api/content/changes?base=${current.commit}`);
  } catch (err) {
    if (err instanceof NetworkError) throw err;
    return null; // e.g. the cached commit no longer exists
  }
  const files = compare.files ?? [];
  if (files.length >= COMPARE_LIMIT) return null;
  const { remove, read } = changedPaths(files, site.folders);
  const items = new Map<string, ContentItem>(current.items.map((i) => [i.path, i]));
  const media = { ...current.media };
  for (const p of [...remove, ...read]) {
    items.delete(p);
    delete media[p];
  }
  for (let i = 0; i < read.length; i += BATCH) {
    const paths = read.slice(i, i + BATCH);
    const res = await api<{ data?: { repository?: Record<string, { oid?: string; text?: string | null } | null> } }>("/api/content/files", {
      method: "POST",
      body: { paths },
    });
    paths.forEach((path, k) => {
      const blob = res.data?.repository?.[`p${k}`];
      if (!blob?.oid || typeof blob.text !== "string") return;
      const it = itemFromFile(path, blob.oid, blob.text, site);
      if (it) items.set(path, it);
      const images = imagesIn(blob.text, site);
      if (images.length) media[path] = images;
    });
  }
  return { version: INDEX_VERSION, commit: head, items: [...items.values()], media };
}

export interface LoadedContent extends ContentIndex {
  /** True when offline and showing the list as it was last read. */
  stale: boolean;
}

/**
 * The current list. Starts from `current` (or the cached copy) and reads only
 * what changed; `force` reads everything again.
 */
export async function updateContent(uid: number, site: IndexSettings, opts: { current?: ContentIndex; force?: boolean } = {}): Promise<LoadedContent> {
  const stored = opts.current?.version === INDEX_VERSION ? opts.current : await cachedContent(uid);
  // Read with other settings (e.g. another `author_field`): read everything again.
  const saved = reusable(stored, site) ? stored : undefined;
  try {
    let index: ContentIndex | null = null;
    if (saved && !opts.force) {
      const { commit } = await api<{ commit: string }>("/api/content/head");
      if (commit === saved.commit) return { ...saved, stale: false };
      index = await readChanges(saved, commit, site);
    }
    index ??= await readAll(site);
    index = { ...index, settings: settingsKey(site) };
    await store(uid, index);
    return { ...index, stale: false };
  } catch (err) {
    if (err instanceof NetworkError && stored) return { ...stored, stale: true };
    throw err;
  }
}
