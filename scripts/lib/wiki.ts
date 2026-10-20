// SPDX-License-Identifier: MIT
//
// wiki/ as the repository's GitHub wiki: which files are pages, and their text
// as the wiki needs it (see CONTRIBUTING.md, Documentation).

/** A file of wiki/ that is a wiki page (Home.md, _Sidebar.md, Users-and-Access.md …). */
export const isPage = (name: string) => /^[A-Za-z0-9_][A-Za-z0-9_-]*\.md$/.test(name);

/**
 * A page's text for the wiki: links to other pages drop their `.md`
 * (`[Updating](Updating.md#x)` → `[Updating](Updating#x)`), since the wiki
 * addresses pages by name. Links with a path or an address, and code, stay.
 */
export function wikiText(text: string): string {
  return text
    .split(/(```[\s\S]*?```|`[^`\n]*`)/)
    .map((part, i) => (i % 2 ? part : part.replace(/\]\(([A-Za-z0-9_][A-Za-z0-9_-]*)\.md(#[^)\s]*)?\)/g, (_, page: string, anchor = "") => `](${page}${anchor})`)))
    .join("");
}
