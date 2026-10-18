// SPDX-License-Identifier: MIT
// The dev site's sample content (templates/sample/): the files committed to
// the dev branch, and the photos uploaded for them, with the sizes Alasin
// itself would make. Photos are found from the content: `/img/<key>` in a file
// means MEDIA's <key>, `/api/draft-media/<draftId>/<file>` a draft's photo in
// DRAFTS. One more photo goes to MEDIA unused, so Media's *Orphaned* filter
// has something to show.
//
// No file access here, so tests can use it.

export interface SampleFile {
  /** Path in the site repository, e.g. content/posts/x.md. */
  path: string;
  text: string;
}

export interface Upload {
  bucket: "media" | "drafts";
  /** The main image's key. */
  key: string;
  /** File in templates/sample/images/ it's made from. */
  image: string;
  /** The smaller sizes, made from the image, as Alasin names them. */
  variants: { key: string; width: number }[];
}

/** A photo in MEDIA that no content uses. */
export const ORPHAN = { key: "2026/05/01/fell-lake.jpg", image: "fell-lake.jpg" };

const MEDIA_REF = (prefix: string) => new RegExp(`${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([0-9A-Za-z/_.-]+\\.(?:jpe?g|png|webp|gif))`, "g");
const DRAFT_REF = /\/api\/draft-media\/([0-9A-HJKMNP-TV-Z]{26})\/([a-z0-9][a-z0-9_-]{0,79}\.(?:jpg|png|webp|gif))/g;

/** "<dir>/<name>.<ext>" with a variant pattern like "{name}-{width}.{ext}". */
function variantKey(key: string, width: number, pattern: string, ext: string): string {
  const slash = key.lastIndexOf("/") + 1;
  const name = key.slice(slash).replace(/\.[^.]+$/, "");
  return key.slice(0, slash) + pattern.replace("{name}", name).replace("{width}", String(width)).replace("{ext}", ext);
}

/**
 * Every photo the sample content needs, once, in the order first used, plus the
 * orphan. `width(image)` is a sample image's width: only smaller sizes are made,
 * as in the app.
 */
export function sampleUploads(
  files: SampleFile[],
  opts: { contentPrefix: string; widths: number[]; variantName: string; variantFormat: "webp" | "jpeg"; images: string[]; width: (image: string) => number },
): Upload[] {
  const uploads = new Map<string, Upload>();
  const ext = opts.variantFormat === "jpeg" ? "jpg" : "webp";
  const add = (bucket: Upload["bucket"], key: string, image: string) => {
    if (uploads.has(`${bucket}:${key}`)) return;
    if (!opts.images.includes(image)) throw new Error(`No sample image ${image} (for ${key})`);
    const w = opts.width(image);
    const variants = [...opts.widths]
      .sort((a, b) => a - b)
      .filter((v) => v < w)
      .map((v) => ({ key: variantKey(key, v, opts.variantName, ext), width: v }));
    uploads.set(`${bucket}:${key}`, { bucket, key, image, variants });
  };
  const base = (key: string) => key.slice(key.lastIndexOf("/") + 1);
  for (const f of files) {
    for (const m of f.text.matchAll(MEDIA_REF(opts.contentPrefix))) add("media", m[1]!, base(m[1]!));
    for (const m of f.text.matchAll(DRAFT_REF)) add("drafts", `${m[1]}/${m[2]}`, m[2]!);
  }
  add("media", ORPHAN.key, ORPHAN.image);
  return [...uploads.values()];
}

/** The site's credits page, from templates/sample/CREDITS.md's table (CC BY asks for credit where the photos are shown). */
export function creditsPage(credits: string): SampleFile {
  const table = credits.split("\n").filter((l) => l.startsWith("|"));
  if (table.length < 3) throw new Error("CREDITS.md has no table");
  return {
    path: "content/pages/credits.md",
    text: `---\ntitle: "Photo credits"\nslug: "credits"\n---\n\nThe sample photos on this site, with their authors and licences. All come from [Wikimedia Commons](https://commons.wikimedia.org/), resized, with their metadata removed.\n\n${table.join("\n")}\n`,
  };
}

/** Width and height of a baseline or progressive JPEG, from its frame header; null if not found. */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1]!;
    const len = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    // SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: (bytes[i + 5]! << 8) | bytes[i + 6]!, width: (bytes[i + 7]! << 8) | bytes[i + 8]! };
    }
    i += 2 + len;
  }
  return null;
}
