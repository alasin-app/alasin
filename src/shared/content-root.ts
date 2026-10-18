// SPDX-License-Identifier: MIT
// The folder that holds both the posts and the pages folder (Hugo's content
// directory, e.g. `content`). The content index reads it whole, so images used
// anywhere in it count as used: the site's home page (`content/_index.md`),
// other sections and their list pages, not only posts and pages.

/** The deepest folder containing both, "" if that's the repository root (then only the two are read). */
export function contentRoot(postsDir: string, pagesDir: string): string {
  const a = postsDir.split("/");
  const b = pagesDir.split("/");
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return a.slice(0, n).join("/");
}
