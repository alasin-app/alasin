// SPDX-License-Identifier: MIT
//
// Images of Hugo page bundles that a post or page refers to by a path rather
// than a media URL: a file next to the bundle's index.md ("diagram.svg", e.g.
// in a shortcode's src), or a file in another page's bundle by its content path
// ("/pages/about/photo.png", e.g. as the cover). The editor shows them;
// Alasin never changes them.

/** Image files that can be shown, by extension. */
export const BUNDLE_IMAGE_TYPES: Record<string, string> = {
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

/** The image type of a path, by its extension; undefined if it isn't one. */
export const bundleImageType = (path: string): string | undefined => BUNDLE_IMAGE_TYPES[path.split(".").pop()!.toLowerCase()];

/** No absolute, empty, `.` or `..` parts. */
export const isPlainPath = (path: string): boolean => !path.startsWith("/") && !path.split("/").some((s) => s === ".." || s === "." || s === "");

/**
 * The repository path of an image that `ref` names in the file at `file`, or
 * null: a URL, not an image, or a relative name outside a page bundle
 * (`…/index.md`). `contentDir` is the content folder ("" for the repository root).
 */
export function bundleImagePath(ref: string, file: string, contentDir: string): string | null {
  const r = ref.trim().split(/[?#]/)[0]!;
  if (!bundleImageType(r) || /^[a-z][a-z0-9+.-]*:|^\/\//i.test(r)) return null;
  let path: string;
  if (r.startsWith("/")) path = contentDir ? `${contentDir}${r}` : r.slice(1);
  else if (/(^|\/)index\.md$/.test(file)) path = file.slice(0, -"index.md".length) + r.replace(/^(\.\/)+/, "");
  else return null;
  return isPlainPath(path) ? path : null;
}
