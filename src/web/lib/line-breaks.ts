// SPDX-License-Identifier: MIT
//
// Line breaks without Shift+Enter (which tablet keyboards don't have).
//
// Markdown joins the lines of a paragraph into one; a line only renders as its
// own line if it ends with two spaces (a "line break"). In the rich text
// editor every new line the user makes should look like one on the site, so:
//   - Enter in a paragraph ends the line with a line break;
//   - Enter on the empty line that follows ends the paragraph instead;
//   - the Quote button quotes the selected lines the same way (line breaks
//     within stanzas, a lone ">" between them), and removes a quote again;
//   - pasted plain text keeps its line breaks.
// Markdown structure (headings, lists, tables, code, shortcodes, rules) never
// gets trailing spaces.

import { continueBlock } from "./continue-block";

/** Lines that are Markdown structure, not paragraph text. */
const STRUCTURE = /^\s*(?:#{1,6}(?:\s|$)|[-*+]\s|\d{1,9}[.)]\s|>|\||```|~~~|\{\{[<%]|(?:[-*_][ \t]*){3,}$)/;
const FENCE = /^\s*(```|~~~)/;
const HARD_BREAK = / {2,}$/;

function insideFence(lines: string[], uptoExclusive: number): boolean {
  let fence: string | null = null;
  for (let i = 0; i < uptoExclusive; i++) {
    const f = FENCE.exec(lines[i]!);
    if (f) fence = fence === null ? f[1]! : fence === f[1] ? null : fence;
  }
  return fence !== null;
}

/** Pasted plain text: single line breaks inside paragraphs become Markdown line breaks. */
export function keepLineBreaks(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const f = FENCE.exec(line);
    if (f) fence = fence === null ? f[1]! : fence === f[1] ? null : fence;
    if (fence !== null || f) continue;
    const next = lines[i + 1];
    if (line.trim() && next?.trim() && !STRUCTURE.test(line) && !STRUCTURE.test(next) && !HARD_BREAK.test(line) && !line.endsWith("\\")) {
      lines[i] = `${line.replace(/[ \t]+$/, "")}  `;
    }
  }
  return lines.join("\n");
}

/** Quotes lines: "> " on each, line breaks within stanzas, ">" for blank lines between them. */
export function quoteLines(lines: string[]): string[] {
  return lines.map((line, i) => {
    if (!line.trim()) return ">";
    const next = lines[i + 1];
    const text = line.replace(/[ \t]+$/, "");
    return `> ${text}${next !== undefined && next.trim() ? "  " : ""}`;
  });
}

/** Removes a quote: the lines keep their line breaks. */
export function unquoteLines(lines: string[]): string[] {
  return lines.map((line) => line.replace(/^\s*>\s?/, "")).map((line) => (line.trim() ? line : ""));
}

export function isQuoted(lines: string[]): boolean {
  const content = lines.filter((l) => l.trim());
  return content.length > 0 && content.every((l) => /^\s*>/.test(l));
}

/**
 * Enter in the rich text editor: lists and quotes continue (continueBlock);
 * in a paragraph, a line break; on the empty line after it, a new paragraph.
 * Returns null where a plain new line is right (headings, code, tables…).
 */
export function richEnter(text: string, cursor: number): { text: string; cursor: number } | null {
  const block = continueBlock(text, cursor);
  if (block) return block;

  const lineStart = text.lastIndexOf("\n", cursor - 1) + 1;
  const lineEndIdx = text.indexOf("\n", cursor);
  const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;
  const line = text.slice(lineStart, lineEnd);
  const lines = text.slice(0, lineStart).split("\n");
  if (insideFence(lines, lines.length - 1)) return null;

  if (!line.trim()) {
    // Second Enter: the line break before this empty line becomes a paragraph end.
    if (lineStart === 0) return null;
    const prevStart = text.lastIndexOf("\n", lineStart - 2) + 1;
    const prev = text.slice(prevStart, lineStart - 1);
    if (!HARD_BREAK.test(prev) || STRUCTURE.test(prev)) return null;
    const trimmed = prev.replace(/ +$/, "");
    const removed = prev.length - trimmed.length;
    const head = `${text.slice(0, prevStart)}${trimmed}\n${text.slice(lineStart, cursor)}`;
    return { text: `${head}\n${text.slice(cursor)}`, cursor: cursor - removed + 1 };
  }
  if (STRUCTURE.test(line) || cursor === lineStart) return null;

  const before = text.slice(0, cursor).replace(/[ \t]+$/, "");
  const after = text.slice(cursor).replace(/^[ \t]+/, "");
  // At the end of the paragraph's text the break is added anyway: the next Enter turns it into a paragraph end.
  return { text: `${before}  \n${after}`, cursor: before.length + 3 };
}

/**
 * On save: line breaks at the end of a paragraph (before a blank line or the
 * end) have nothing to break. Lines in `keep` (as last saved) stay as they are.
 */
export function dropDanglingBreaks(text: string, keep?: Set<string>): string {
  const lines = text.split("\n");
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const f = FENCE.exec(lines[i]!);
    if (f) fence = fence === null ? f[1]! : fence === f[1] ? null : fence;
    if (fence !== null || f) continue;
    const next = lines[i + 1];
    if (HARD_BREAK.test(lines[i]!) && (next === undefined || !next.trim()) && !keep?.has(lines[i]!)) lines[i] = lines[i]!.replace(/ +$/, "");
  }
  return lines.join("\n");
}
