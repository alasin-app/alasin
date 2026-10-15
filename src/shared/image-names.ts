// SPDX-License-Identifier: MIT
//
// Image file names. The base name of every stored image is the original
// uploaded file name, made safe for URLs and R2 keys: `IMG_3438.JPG` →
// `img_3438`. The extension is chosen from the detected image type, never
// taken from the client. If the name is already taken (published images are
// never overwritten), a counter is added: `img_3438-2`.

const MAX_BASE_LENGTH = 80;

/** Turns an uploaded file name into a safe base name without extension. */
export function baseNameFromUpload(originalName: string): string {
  const file = originalName.split(/[\\/]/).pop() ?? "";
  const dot = file.lastIndexOf(".");
  const stem = dot > 0 ? file.slice(0, dot) : file;
  const safe = stem
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // diacritics: ä → a, ö → o, å → a
    .replace(/ß/g, "ss")
    .replace(/[æ]/gi, "ae")
    .replace(/[ø]/gi, "o")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, MAX_BASE_LENGTH)
    .replace(/[-_]+$/g, "");
  return safe || "image";
}

/** File extension for a detected image type. */
export function extensionFor(type: "image/jpeg" | "image/png" | "image/webp" | "image/gif"): string {
  return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[type];
}

/**
 * The original base name if it's free, otherwise `<base>-2`, `<base>-3`, …
 * `isTaken` must check every key the image would use (main image and variants).
 */
export async function uniqueBaseName(base: string, isTaken: (candidate: string) => Promise<boolean>, maxTries = 100): Promise<string> {
  if (!(await isTaken(base))) return base;
  for (let n = 2; n <= maxTries; n++) {
    const candidate = `${base}-${n}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  throw new Error(`no free file name for ${base}`);
}
