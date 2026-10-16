// SPDX-License-Identifier: MIT
// Site settings for the editor (GET /api/site). No browser dependencies, so tests can import it.

import type { Category } from "../../shared/categories";

export interface SiteSettings {
  frontMatterFormat: "yaml" | "toml";
  coverField: string;
  authorField: string | null;
  author: string | null;
  /** The allowed users and the author field values that mean each of them. */
  users: { login: string; id: number; names: string[] }[];
  categories: Category[];
  categoriesEditable: boolean;
  gallery: { shortcode: string; paired: boolean };
  /** Edit lock timing (`[editor]`). */
  locks: { heartbeatSeconds: number; expirySeconds: number };
  /** How Markdown refers to published images, to show them in the editor. */
  media: { publicUrl: string; contentPrefix: string; browse: string[]; byMonth: boolean };
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
