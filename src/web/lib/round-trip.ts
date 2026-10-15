// SPDX-License-Identifier: MIT
//
// The round-trip guarantee: opening an existing post or page in the editor and
// saving it without changes must give back exactly the same file. This runs
// the editor's own reading and saving code (no browser needed), for the
// automated tests and for `npm run roundtrip` against any site's content.

import { parseDraft, prepareSave } from "./draft-model";
import type { SiteSettings } from "./site-types";

export type RoundTrip = { ok: true } | { ok: false; reason: string; line?: number; before?: string; after?: string };

export function roundTrip(text: string, site: SiteSettings): RoundTrip {
  const doc = parseDraft(text, site);
  if (!doc) return { ok: false, reason: "no front matter" };
  // Both editor modes save: rich text (with its tidying) and Markdown.
  for (const rich of [true, false]) {
    const { content } = prepareSave(doc, site, { rich, saved: text });
    if (content !== text) {
      const a = text.split("\n");
      const b = content.split("\n");
      const i = a.findIndex((l, k) => l !== b[k]);
      const at = i === -1 ? a.length : i;
      return { ok: false, reason: rich ? "changed when saved in rich text mode" : "changed when saved in Markdown mode", line: at + 1, before: a[at], after: b[at] };
    }
  }
  return { ok: true };
}
