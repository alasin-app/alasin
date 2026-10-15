// SPDX-License-Identifier: MIT
// Messages between the editor and the image worker.

export interface ImageJob {
  id: number;
  file: Blob;
  settings: {
    maxSize: number;
    mainQuality: number;
    quality: number;
    widths: number[];
    variantFormat: "webp" | "jpeg";
    keepExif: boolean;
    acceptedTypes: string[];
    /** Testing: use the bundled WebP encoder even if the browser has one. */
    forceWasmWebp?: boolean;
  };
}

export interface ProcessedImage {
  /** Main image: resized, rotated upright, without GPS. */
  main: { blob: Blob; ext: "jpg" | "png" | "gif"; type: string };
  width: number;
  height: number;
  variants: { width: number; blob: Blob; ext: "webp" | "jpg"; type: string }[];
}

export type ImageErrorCode = "heic" | "unsupported" | "decode" | "no_canvas";

export type ImageResult = { id: number; ok: true; image: ProcessedImage } | { id: number; ok: false; error: ImageErrorCode };
