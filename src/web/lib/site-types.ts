// SPDX-License-Identifier: MIT
// Site settings for the editor (GET /api/site). No browser dependencies, so tests can import it.

import type { Category } from "../../shared/categories";

export interface SiteSettings {
  frontMatterFormat: "yaml" | "toml";
  coverField: string;
  /** Front matter field for the author's name, as last written. */
  authorField: string;
  /** Front matter field for the author's GitHub login: who wrote it. */
  authorIdField: string;
  /** The signed-in user's name, and their GitHub login. */
  author: string | null;
  login: string;
  /** The allowed users, with their current GitHub profile names. */
  users: { login: string; id: number; name: string | null }[];
  categories: Category[];
  categoriesEditable: boolean;
  gallery: { shortcode: string; paired: boolean };
  /** Edit lock timing (`[editor]`). */
  locks: { heartbeatSeconds: number; expirySeconds: number };
  /** How Markdown refers to published images, to show them in the editor. */
  media: { publicUrl: string; contentPrefix: string; browse: string[]; byMonth: boolean };
  /** Folders of the site repository, as configured. */
  /** `content`: the folder holding posts and pages, read whole for image usage ("" if none). */
  folders: { content: string; posts: string; pages: string; drafts: string; archive: string; bin: string };
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
