// SPDX-License-Identifier: MIT
//
// Image processing off the main thread: decode with EXIF orientation applied,
// resize to the site's sizes, re-encode (which drops all metadata, including
// GPS) and optionally carry over a safe subset of EXIF. WebP variants use the
// browser's encoder when it has one, otherwise a bundled WebAssembly encoder
// (Safari and every iOS browser can't encode WebP).

/// <reference lib="webworker" />

import { carrySafeExif } from "../../shared/exif-writer";
import { sniffImageType } from "../../shared/image-files";
import type { ImageErrorCode, ImageJob, ImageResult, ProcessedImage } from "../lib/image-types";

declare const self: DedicatedWorkerGlobalScope;

class JobError extends Error {
  constructor(readonly code: ImageErrorCode) {
    super(code);
  }
}

function isHeic(head: Uint8Array): boolean {
  const brand = String.fromCharCode(...head.subarray(4, 12));
  return /^ftyp(heic|heix|hevc|hevx|mif1|msf1)$/.test(brand);
}

let nativeWebp: boolean | undefined;

async function encodeWebp(canvas: OffscreenCanvas, quality: number, forceWasm = false): Promise<Blob> {
  if (nativeWebp !== false && !forceWasm) {
    const blob = await canvas.convertToBlob({ type: "image/webp", quality: quality / 100 });
    nativeWebp = blob.type === "image/webp";
    if (nativeWebp) return blob;
  }
  const { default: encode } = await import("@jsquash/webp/encode");
  const ctx = canvas.getContext("2d")!;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return new Blob([await encode(data, { quality })], { type: "image/webp" });
}

function draw(bitmap: ImageBitmap, width: number, height: number): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new JobError("no_canvas");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

async function processImage(job: ImageJob): Promise<ProcessedImage> {
  const { file, settings } = job;
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const type = sniffImageType(head);
  if (!type) throw new JobError(isHeic(head) ? "heic" : "unsupported");
  if (!settings.acceptedTypes.includes(type)) throw new JobError("unsupported");

  if (type === "image/gif") {
    // Kept as it is (animation); GIF has no EXIF or GPS.
    return { main: { blob: file, ext: "gif", type }, width: 0, height: 0, variants: [] };
  }
  if (typeof OffscreenCanvas === "undefined") throw new JobError("no_canvas");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new JobError("decode");
  }
  const scale = Math.min(1, settings.maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const mainCanvas = draw(bitmap, width, height);
  const mainType = type === "image/png" ? "image/png" : "image/jpeg";
  let main = await mainCanvas.convertToBlob({ type: mainType, quality: settings.mainQuality / 100 });
  if (settings.keepExif && type === "image/jpeg" && mainType === "image/jpeg") {
    const original = new Uint8Array(await file.arrayBuffer());
    const withExif = carrySafeExif(original, new Uint8Array(await main.arrayBuffer()));
    main = new Blob([withExif as Uint8Array<ArrayBuffer>], { type: "image/jpeg" });
  }

  const variants: ProcessedImage["variants"] = [];
  for (const w of [...settings.widths].sort((a, b) => a - b)) {
    if (w >= width) continue; // only sizes smaller than the image
    const h = Math.round((height * w) / width);
    const canvas = draw(bitmap, w, h);
    if (settings.variantFormat === "webp") {
      variants.push({ width: w, blob: await encodeWebp(canvas, settings.quality, settings.forceWasmWebp), ext: "webp", type: "image/webp" });
    } else {
      const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: settings.quality / 100 });
      variants.push({ width: w, blob, ext: "jpg", type: "image/jpeg" });
    }
  }
  bitmap.close();
  return { main: { blob: main, ext: mainType === "image/png" ? "png" : "jpg", type: mainType }, width, height, variants };
}

self.onmessage = async (e: MessageEvent<ImageJob>) => {
  const job = e.data;
  let result: ImageResult;
  try {
    result = { id: job.id, ok: true, image: await processImage(job) };
  } catch (err) {
    result = { id: job.id, ok: false, error: err instanceof JobError ? err.code : "decode" };
  }
  self.postMessage(result);
};
