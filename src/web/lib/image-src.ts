// SPDX-License-Identifier: MIT
// Where the editor shows an image from, by how the text or front matter refers to it.

import { bundleImagePath } from "../../shared/bundle-files";
import { apiPath } from "./current-site";
import type { SiteSettings } from "./site-types";

type Site = Pick<SiteSettings, "media" | "folders">;

/** A page bundle's image, read from the repository (see bundleImagePath); null if `ref` isn't one. */
export function bundleSrc(site: Site, ref: string, file = ""): string | null {
  if (ref.startsWith("/api/")) return null;
  const path = bundleImagePath(ref, file, site.folders.content);
  return path ? apiPath(`/api/content/asset?path=${encodeURIComponent(path)}`) : null;
}

/** A published photo from the media bucket, a page bundle's image from the repository, a draft's from the site's routes. */
export function imageSrc(site: Site, url: string, file?: string): string {
  const { contentPrefix, publicUrl } = site.media;
  if (contentPrefix.startsWith("/") && url.startsWith(contentPrefix)) return publicUrl + url.slice(contentPrefix.length);
  return bundleSrc(site, url, file) ?? apiPath(url);
}
