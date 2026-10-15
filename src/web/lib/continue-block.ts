// SPDX-License-Identifier: MIT
// Enter in the Markdown text area continues a list item or quote line, like
// Notes or Mail: "- ", "* ", "+ ", "1. " (numbered up) and "> ". Enter on an
// empty item ends the list or quote instead, leaving a blank line after it.
//
// In a quote, Enter starts a new paragraph inside the quote ("> a", ">", "> "):
// Markdown joins consecutive quote lines into one line, as it does for any
// paragraph, so a lone ">" line keeps them apart.

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
    // Ending a quote also drops the paragraph separator Enter added before this line.
    if (m[5]) {
      const prevStart = text.lastIndexOf("\n", lineStart - 2) + 1;
      if (lineStart > 0 && /^\s*>\s*$/.test(text.slice(prevStart, lineStart - 1))) {
        const rest = text.slice(lineEnd);
        return rest.startsWith("\n")
          ? { text: text.slice(0, prevStart) + rest, cursor: prevStart }
          : { text: `${text.slice(0, prevStart)}\n`, cursor: prevStart + 1 };
      }
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
  const next = bullet
    ? `${indent}${bullet}${space}`
    : number
      ? `${indent}${Number(number) + 1}${delim}${space}`
      : `${indent}${quote}\n${indent}${quote}${space}`;
  return { text: `${text.slice(0, cursor)}\n${next}${text.slice(cursor)}`, cursor: cursor + 1 + next.length };
}
