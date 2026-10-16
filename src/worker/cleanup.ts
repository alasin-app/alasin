// SPDX-License-Identifier: MIT
//
// The nightly cleanup of the private DRAFTS bucket (spec §4). Photos live
// there under `<draftId>/` while their draft is unpublished. When a draft is
// published or permanently deleted, Alasin removes its folder at once; this
// catches what that misses: drafts deleted directly on GitHub, failed
// clean-ups, and photos uploaded while editing a published post that was then
// never saved.
//
// A folder is removed only if no draft with its ID exists in the repository
// (in the drafts folder or in the Bin) and nothing in it changed for
// `[drafts] cleanup_after_days` (so photos of a draft that is still only on
// someone's device, or of an editing session in progress, are kept). If the
// repository can't be read, nothing is deleted. Only DRAFTS is ever touched.

import type { AlasinConfig } from "../shared/config/schema";
import { isUlid } from "../shared/ulid";
import { Repo } from "./lib/repo";

export interface CleanupResult {
  folders: number;
  removedFolders: string[];
  removedObjects: number;
}

/** Draft IDs that exist in the repository: in the drafts folder and in the Bin. */
async function existingDrafts(repo: Repo, config: AlasinConfig): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const dir of [config.drafts.dir, `${config.bin.dir}/${config.drafts.dir}`]) {
    for (const type of ["posts", "pages"]) {
      // A listing that fails throws, so nothing is deleted.
      for (const entry of await repo.listDir(`${dir}/${type}`)) {
        const id = entry.name.replace(/\.md$/, "");
        if (entry.type === "file" && isUlid(id)) ids.add(id);
      }
    }
  }
  return ids;
}

export async function cleanupDrafts(bucket: R2Bucket, repo: Repo, config: AlasinConfig, now = Date.now()): Promise<CleanupResult> {
  const keep = await existingDrafts(repo, config);
  const graceMs = config.drafts.cleanup_after_days * 24 * 60 * 60 * 1000;

  // Every folder with its keys and its newest upload.
  const folders = new Map<string, { keys: string[]; newest: number }>();
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ limit: 1000, ...(cursor ? { cursor } : {}) });
    for (const o of page.objects) {
      const id = o.key.split("/")[0]!;
      const f = folders.get(id) ?? { keys: [], newest: 0 };
      f.keys.push(o.key);
      f.newest = Math.max(f.newest, o.uploaded.getTime());
      folders.set(id, f);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  const result: CleanupResult = { folders: folders.size, removedFolders: [], removedObjects: 0 };
  for (const [id, f] of folders) {
    if (!isUlid(id) || keep.has(id) || now - f.newest < graceMs) continue;
    for (let i = 0; i < f.keys.length; i += 1000) await bucket.delete(f.keys.slice(i, i + 1000));
    result.removedFolders.push(id);
    result.removedObjects += f.keys.length;
  }
  return result;
}
