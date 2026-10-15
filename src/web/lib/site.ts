// SPDX-License-Identifier: MIT
// Site settings for the editor (GET /api/site), loaded once per app session.

import { api } from "./api";

export interface SiteSettings {
  frontMatterFormat: "yaml" | "toml";
  coverField: string;
  authorField: string | null;
  author: string | null;
  categories: { slug: string; title: string }[];
  gallery: { shortcode: string; paired: boolean };
  images: {
    widths: number[];
    quality: number;
    maxSize: number;
    mainQuality: number;
    variantFormat: "webp" | "jpeg";
    variantName: string;
    keepExif: boolean;
    acceptedTypes: string[];
    maxUploadMb: number;
  };
}

let cached: Promise<SiteSettings> | undefined;

export function loadSite(): Promise<SiteSettings> {
  cached ??= api<SiteSettings>("/api/site").catch((err: unknown) => {
    cached = undefined;
    throw err;
  });
  return cached;
}
