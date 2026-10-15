// SPDX-License-Identifier: MIT
// Enter in the Markdown text area continues a list item or quote line, like
// Notes or Mail: "- ", "* ", "+ ", "1. " (numbered up) and "> ". Enter on an
// empty item ends the list or quote instead, leaving a blank line after it.
//
// In a quote, Enter continues on a new line that renders as its own line: the
// line gets a Markdown line break (two trailing spaces) — Markdown would
// otherwise join consecutive quote lines into one, as it does for any
// paragraph. Enter on an empty quote line ends the quote.

const PREFIX = /^(\s*)(?:([-*+])|(\d{1,9})([.)])|(>))(\s+)/;

/** The text and cursor after pressing Enter at `cursor`, or null to let the text area handle it. */
export function continueBlock(text: string, cursor: number): { text: string; cursor: number } | null {
  const lineStart = text.lastIndexOf("\n", cursor - 1) + 1;
  const lineEndIdx = text.indexOf("\n", cursor);
  const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;
  const line = text.slice(lineStart, lineEnd);
  const m = PREFIX.exec(line);
  if (!m) return null;
  const prefix = m[0];

  // Enter on an item with nothing in it: end the list or quote with a blank line,
  // so the next paragraph isn't read as part of it (Markdown's lazy continuation).
  if (line.slice(prefix.length).trim() === "" && cursor >= lineStart + prefix.length) {
    if (m[5] && lineStart > 0) {
      const prevStart = text.lastIndexOf("\n", lineStart - 2) + 1;
      const prev = text.slice(prevStart, lineStart - 1);
      const rest = text.slice(lineEnd);
      const end = (head: string) =>
        rest.startsWith("\n") ? { text: head + rest, cursor: head.length } : { text: `${head}\n`, cursor: head.length + 1 };
      // A lone ">" before this line (a paragraph separator) goes too.
      if (/^\s*>\s*$/.test(prev)) return end(text.slice(0, prevStart));
      // The line break at the end of the last quote line has nothing to break any more.
      if (/^\s*>/.test(prev) && / {2,}$/.test(prev)) return end(`${text.slice(0, prevStart)}${prev.replace(/ +$/, "")}\n`);
    }
    const rest = text.slice(lineEnd);
    // If more text follows, the emptied line itself is the blank line.
    return rest.startsWith("\n")
      ? { text: text.slice(0, lineStart) + rest, cursor: lineStart }
      : { text: `${text.slice(0, lineStart)}\n`, cursor: lineStart + 1 };
  }
  // Only continue when the cursor is after the marker.
  if (cursor < lineStart + prefix.length) return null;

  const [, indent, bullet, number, delim, quote, space] = m;
  if (quote) {
    const before = text.slice(0, cursor).replace(/[ \t]+$/, "");
    const after = text.slice(cursor).replace(/^[ \t]+/, "");
    const next = `  \n${indent}${quote}${space}`;
    return { text: before + next + after, cursor: before.length + next.length };
  }
  const next = bullet ? `${indent}${bullet}${space}` : `${indent}${Number(number) + 1}${delim}${space}`;
  return { text: `${text.slice(0, cursor)}\n${next}${text.slice(cursor)}`, cursor: cursor + 1 + next.length };
}
