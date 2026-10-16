// SPDX-License-Identifier: MIT
// The media library shows each published image once: its variants
// (`<name>-<width>.<ext>` next to it) only give it a small thumbnail.

export interface LibraryImage {
  key: string;
  /** The smallest variant, or the image itself if it has none. */
  thumb: string;
}

const stemOf = (key: string) => key.replace(/\.[A-Za-z0-9]+$/, "");

/** Main images with their thumbnails, newest day first (keys are `…/dd/name`), then by name. */
export function groupImages(keys: string[]): LibraryImage[] {
  const stems = new Set(keys.map(stemOf));
  const variantOf = (key: string) => {
    const m = /^(.*)-(\d{2,5})\.[A-Za-z0-9]+$/.exec(key);
    return m && stems.has(m[1]!) ? { stem: m[1]!, width: Number(m[2]) } : null;
  };
  const smallest = new Map<string, { key: string; width: number }>();
  for (const key of keys) {
    const v = variantOf(key);
    if (v && (smallest.get(v.stem)?.width ?? Infinity) > v.width) smallest.set(v.stem, { key, width: v.width });
  }
  const dir = (key: string) => key.slice(0, key.lastIndexOf("/") + 1);
  return keys
    .filter((k) => !variantOf(k))
    .map((key) => ({ key, thumb: smallest.get(stemOf(key))?.key ?? key }))
    .sort((a, b) => (dir(a.key) === dir(b.key) ? a.key.localeCompare(b.key) : dir(b.key).localeCompare(dir(a.key))));
}
