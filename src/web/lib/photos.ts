// SPDX-License-Identifier: MIT
//
// From picked photos to uploaded draft images: process in the image worker,
// ask the server for a name based on the original file name, then upload the
// main image and its variants with progress and retries.

import type { ImageErrorCode, ImageJob, ImageResult, ProcessedImage } from "./image-types";
import type { SiteSettings } from "./site";

let worker: Worker | undefined;
let nextJob = 1;
const waiting = new Map<number, (r: ImageResult) => void>();

function imageWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../workers/image-worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<ImageResult>) => {
      waiting.get(e.data.id)?.(e.data);
      waiting.delete(e.data.id);
    };
  }
  return worker;
}

function debugFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export class PhotoError extends Error {
  constructor(
    readonly code: ImageErrorCode | "too_large" | "gps" | "network" | "server",
    message: string = code,
  ) {
    super(message);
    this.name = "PhotoError";
  }
}

export function processPhoto(file: Blob, site: SiteSettings): Promise<ProcessedImage> {
  const id = nextJob++;
  const job: ImageJob = {
    id,
    file,
    settings: {
      maxSize: site.images.maxSize,
      mainQuality: site.images.mainQuality,
      quality: site.images.quality,
      widths: site.images.widths,
      variantFormat: site.images.variantFormat,
      keepExif: site.images.keepExif,
      acceptedTypes: site.images.acceptedTypes,
      forceWasmWebp: debugFlag("alasin.debug.wasmWebp"),
    },
  };
  return new Promise((resolve, reject) => {
    waiting.set(id, (r) => (r.ok ? resolve(r.image) : reject(new PhotoError(r.error))));
    imageWorker().postMessage(job);
  });
}

/** PUT with upload progress (fetch has none). */
function put(url: string, blob: Blob, type: string, onProgress: (loaded: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("X-Alasin", "1");
    xhr.setRequestHeader("Content-Type", type);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let error: { error?: string; message?: string } = {};
      try {
        error = JSON.parse(xhr.responseText) as typeof error;
      } catch {
        // not JSON
      }
      const code = error.error === "gps" ? "gps" : error.error === "too_large" ? "too_large" : "server";
      reject(Object.assign(new PhotoError(code, error.message ?? xhr.statusText), { status: xhr.status }));
    };
    xhr.onerror = () => reject(new PhotoError("network"));
    xhr.send(blob);
  });
}

async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  const delays = [1000, 3000, 7000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      const status = (err as { status?: number }).status ?? 0;
      const retryable = err instanceof PhotoError && (err.code === "network" || (err.code === "server" && (status >= 500 || status === 429)));
      if (!retryable || attempt >= delays.length) throw err;
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
}

export interface UploadedPhoto {
  /** URL of the main image (a draft media URL until published). */
  url: string;
  base: string;
}

/** Uploads a processed photo; `onProgress` gets 0–1. */
export async function uploadPhoto(
  draftId: string,
  originalName: string,
  image: ProcessedImage,
  onProgress: (fraction: number) => void,
): Promise<UploadedPhoto> {
  const res = await fetch(`/api/draft-media/${draftId}/names`, {
    method: "POST",
    headers: { "X-Alasin": "1", "Content-Type": "application/json" },
    body: JSON.stringify({ name: originalName }),
  }).catch(() => {
    throw new PhotoError("network");
  });
  if (!res.ok) throw new PhotoError("server", res.statusText);
  const { base } = (await res.json()) as { base: string };

  const parts = [
    { name: `${base}.${image.main.ext}`, blob: image.main.blob, type: image.main.type },
    ...image.variants.map((v) => ({ name: `${base}-${v.width}.${v.ext}`, blob: v.blob, type: v.type })),
  ];
  const total = parts.reduce((n, p) => n + p.blob.size, 0) || 1;
  const done = new Map<string, number>();
  const report = () => onProgress([...done.values()].reduce((a, b) => a + b, 0) / total);
  // Variants first, so the main image's URL only appears once everything is there.
  for (const p of [...parts.slice(1), parts[0]!]) {
    await withRetry(() =>
      put(`/api/draft-media/${draftId}/${p.name}`, p.blob, p.type, (loaded) => {
        done.set(p.name, loaded);
        report();
      }),
    );
    done.set(p.name, p.blob.size);
    report();
  }
  return { url: `/api/draft-media/${draftId}/${parts[0]!.name}`, base };
}

/** Markdown for one image, or a gallery of several with the site's shortcode. */
export function photosMarkdown(urls: string[], gallery: SiteSettings["gallery"]): string {
  const images = urls.map((u) => `![](${u})`);
  if (urls.length < 2 || !gallery.paired) return images.join("\n\n");
  return `{{< ${gallery.shortcode} >}}\n\n${images.join("\n\n")}\n\n{{< /${gallery.shortcode} >}}`;
}
