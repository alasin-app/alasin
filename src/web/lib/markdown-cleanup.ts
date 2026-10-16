// SPDX-License-Identifier: MIT
//
// Tidying when a draft is saved: removes list items and quote lines left
// empty while writing ("-", "1.", ">" alone on a line). Lines Markdown gives a
// meaning to are kept:
//   - ">" between two quote lines separates paragraphs inside a quote;
//   - "-" right under a paragraph line makes that line a heading (setext);
//   - nothing inside fenced code blocks is touched.
// Lines exactly as they were in the last saved version are never touched
// either, so opening and saving an existing post changes nothing.

const EMPTY_ITEM = /^\s*(?:[-*+]|\d{1,9}[.)])\s*$/;
const EMPTY_QUOTE = /^\s*>\s*$/;
const LIST_ITEM = /^\s*(?:[-*+]|\d{1,9}[.)])\s+\S/;
const QUOTE = /^\s*>/;
const FENCE = /^\s*(```|~~~)/;

export function removeEmptyItems(body: string, keep?: Set<string>): string {
  const lines = body.split("\n");
  const out: string[] = [];
  let fence: string | null = null;
  let removedBetweenBlanks = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const f = FENCE.exec(line);
    if (f) fence = fence === null ? f[1]! : fence === f[1] ? null : fence;
    if (fence !== null || f) {
      out.push(line);
      continue;
    }
    // Skip one blank line after a removed line that sat between blank lines.
    if (removedBetweenBlanks && line.trim() === "") {
      removedBetweenBlanks = false;
      continue;
    }
    removedBetweenBlanks = false;

    const prev = out.length ? out[out.length - 1]! : "";
    const next = lines[i + 1] ?? "";
    const prevIsParagraph = prev.trim() !== "" && !LIST_ITEM.test(prev) && !EMPTY_ITEM.test(prev) && !QUOTE.test(prev);
    const remove =
      !keep?.has(line) &&
      ((EMPTY_ITEM.test(line) && !prevIsParagraph) || (EMPTY_QUOTE.test(line) && !(QUOTE.test(prev) && QUOTE.test(next))));
    if (remove) {
      removedBetweenBlanks = prev.trim() === "" && next.trim() === "";
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}
