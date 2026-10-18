// SPDX-License-Identifier: MIT
// The images in the Bin (GET /api/media-bin), shared by the Bin list and the
// sidebar's count. Read when first needed and again after each change.

import { useEffect, useState } from "preact/hooks";
import { api } from "./api";

export interface BinImage {
  /** The MEDIA key it was deleted from (and is recovered to). */
  key: string;
  /** Its smallest size variant in the Bin, for the thumbnail. */
  thumb: string;
  deletedBy: string;
  /** ISO time, "" if unknown. */
  deletedAt: string;
}

/** A thumbnail or the image itself, from the private bucket. */
export const binImageUrl = (key: string) => `/api/media-bin/file?key=${encodeURIComponent(key)}`;

let images: BinImage[] | null = null;
let failed = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Reads the list again. */
export function refreshMediaBin(): Promise<void> {
  loading ??= api<{ images: BinImage[] }>("/api/media-bin")
    .then(
      (r) => {
        images = r.images;
        failed = false;
      },
      () => {
        failed = true;
      },
    )
    .finally(() => {
      loading = null;
      notify();
    });
  return loading;
}

export function useMediaBin(): { images: BinImage[] | null; failed: boolean; refresh: () => Promise<void> } {
  const [, update] = useState(0);
  useEffect(() => {
    const listener = () => update((n) => n + 1);
    listeners.add(listener);
    if (!images && !loading) void refreshMediaBin();
    return () => void listeners.delete(listener);
  }, []);
  return { images, failed, refresh: refreshMediaBin };
}
