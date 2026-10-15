// SPDX-License-Identifier: MIT
//
// As-you-type search over titles and text, in the browser. Case and
// diacritics don't matter (ä = a), small typos are forgiven, words can be
// typed partly, and title matches rank above text matches. No browser
// dependencies, so tests can import it.

import MiniSearch from "minisearch";
import type { ContentItem } from "./content-index";

/** Lower case without diacritics: "Kesäloma" → "kesaloma". */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export interface Search {
  /** Paths of the matching items, best first. */
  find(query: string): string[];
}

export function createSearch(items: ContentItem[]): Search {
  const index = new MiniSearch<ContentItem>({
    idField: "path",
    fields: ["title", "text", "tags", "categories"],
    extractField: (item, field) => {
      const v = item[field as keyof ContentItem];
      return Array.isArray(v) ? v.join(" ") : String(v ?? "");
    },
    processTerm: (term) => fold(term),
    searchOptions: {
      boost: { title: 3, tags: 2, categories: 2 },
      prefix: true,
      fuzzy: (term) => (term.length > 3 ? 0.2 : false),
      combineWith: "AND",
    },
  });
  index.addAll(items);
  return {
    find(query) {
      return query.trim() ? index.search(query).map((r) => String(r.id)) : [];
    },
  };
}

export type Snippet = { text: string; match: boolean }[];

/**
 * A short piece of `text` around the first query word found in it, split into
 * matching and other parts for highlighting; null if no word is found as such
 * (e.g. only a typo matched).
 */
export function snippet(text: string, query: string, width = 140): Snippet | null {
  const words = fold(query).split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return null;
  // Folding keeps the length of most texts; if it doesn't, find words in the folded text only.
  const folded = fold(text);
  if (folded.length !== text.length) return null;
  const first = Math.min(...words.map((w) => folded.indexOf(w)).filter((i) => i >= 0));
  if (!Number.isFinite(first)) return null;
  let start = Math.max(0, first - Math.floor(width / 3));
  if (start > 0) start = text.indexOf(" ", start) + 1 || start;
  const end = Math.min(text.length, start + width);
  const piece = text.slice(start, end);
  const pieceFolded = folded.slice(start, end);
  const parts: Snippet = [];
  let at = 0;
  const pattern = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
  for (const m of pieceFolded.matchAll(pattern)) {
    if (m.index! > at) parts.push({ text: piece.slice(at, m.index), match: false });
    parts.push({ text: piece.slice(m.index, m.index! + m[0].length), match: true });
    at = m.index! + m[0].length;
  }
  if (at < piece.length) parts.push({ text: piece.slice(at), match: false });
  if (start > 0) parts.unshift({ text: "…", match: false });
  if (end < text.length) parts.push({ text: "…", match: false });
  return parts;
}
