// SPDX-License-Identifier: MIT
//
// Copies a draft's images from the private DRAFTS bucket to the public MEDIA
// bucket when it is published. Never overwrites: every destination key is
// checked first, and a taken name gets `-2`, `-3`… (main image and its resized
// variants always share one name). Each copy records where it came from, so a
// retry after a failure reuses the copies it already made instead of making
// new ones.

import { uniqueBaseName } from "../../shared/image-names";
import { type Day, type DraftImageRef, mediaKey } from "../../shared/publish";

/** Custom metadata on copies in MEDIA: the DRAFTS key it was copied from. */
const SOURCE = "alasinSource";

export interface MediaSettings {
  pathPattern: string;
  contentPrefix: string;
  cacheControl: string;
}

export class MissingImageError extends Error {
  constructor(readonly file: string) {
    super(`draft image ${file} not found`);
    this.name = "MissingImageError";
  }
}

const stemOf = (file: string) => file.replace(/\.[a-z]+$/, "");
const extOf = (file: string) => /\.([a-z]+)$/.exec(file)![1]!;

/** The resized variants of a main image among a draft's files: `<stem>-<width>.<ext>`. */
function variantsOf(main: string, files: string[]): { file: string; suffix: string }[] {
  const stem = stemOf(main);
  return files
    .map((f) => ({ f, m: /^(.*)-(\d{2,5})\.[a-z]+$/.exec(f) }))
    .filter((x) => x.m && x.m[1] === stem)
    .map((x) => ({ file: x.f, suffix: `-${x.m![2]}` }));
}

/**
 * Copies the referenced images and their variants. Returns the public URL of
 * each referenced image, keyed `<draftId>/<file>`.
 */
export async function copyDraftImages(
  drafts: R2Bucket,
  media: R2Bucket,
  refs: DraftImageRef[],
  day: Day,
  settings: MediaSettings,
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  /** Keys chosen in this publish, so two images never get the same name. */
  const reserved = new Set<string>();
  const listings = new Map<string, string[]>();

  for (const ref of refs) {
    let files = listings.get(ref.draftId);
    if (!files) {
      const listed = await drafts.list({ prefix: `${ref.draftId}/`, limit: 1000 });
      files = listed.objects.map((o) => o.key.slice(ref.draftId.length + 1));
      listings.set(ref.draftId, files);
    }
    if (!files.includes(ref.file)) throw new MissingImageError(ref.file);
    const parts = [{ file: ref.file, suffix: "" }, ...variantsOf(ref.file, files)];
    const keysFor = (base: string) => parts.map((p) => ({ source: `${ref.draftId}/${p.file}`, key: mediaKey(settings.pathPattern, day, `${base}${p.suffix}`, extOf(p.file)) }));

    // A name is free if none of its keys exists, or each existing one is our own earlier copy.
    const base = await uniqueBaseName(stemOf(ref.file), async (candidate) => {
      for (const { source, key } of keysFor(candidate)) {
        if (reserved.has(key)) return true;
        const existing = await media.head(key);
        if (existing && existing.customMetadata?.[SOURCE] !== source) return true;
      }
      return false;
    });

    for (const { source, key } of keysFor(base)) {
      reserved.add(key);
      const existing = await media.head(key);
      if (existing) continue; // copied by an earlier attempt
      const object = await drafts.get(source);
      if (!object) throw new MissingImageError(source);
      const written = await media.put(key, await object.arrayBuffer(), {
        httpMetadata: { contentType: object.httpMetadata?.contentType, cacheControl: settings.cacheControl },
        customMetadata: { [SOURCE]: source },
        // Never replace an object that appeared since the check above.
        onlyIf: { etagDoesNotMatch: "*" },
      });
      if (!written) throw new Error(`${key} appeared in MEDIA during publishing`);
    }
    urls.set(`${ref.draftId}/${ref.file}`, `${settings.contentPrefix}${keysFor(base)[0]!.key}`);
  }
  return urls;
}
