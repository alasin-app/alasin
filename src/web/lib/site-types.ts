// SPDX-License-Identifier: MIT
// Site settings for the editor (GET /api/site). No browser dependencies, so tests can import it.

import type { Category } from "../../shared/categories";

export interface SiteSettings {
  frontMatterFormat: "yaml" | "toml";
  coverField: string;
  authorField: string | null;
  author: string | null;
  categories: Category[];
  gallery: { shortcode: string; paired: boolean };
  /** How Markdown refers to published images, to show them in the editor. */
  media: { publicUrl: string; contentPrefix: string };
  /** Folders of the site repository, as configured. */
  folders: { posts: string; pages: string; drafts: string; archive: string; bin: string };
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
