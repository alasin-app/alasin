// SPDX-License-Identifier: MIT
//
// What's New (wiki/What's-New.md) from the pull requests in a release: each
// one's "## What's New" section, in plain words, becomes a line of the
// version's section (see CONTRIBUTING.md, Documentation).

/** The PR numbers of squash-merged commits ("feat(web): … (#366)"), newest first, without release commits. */
export function pullRequests(subjects: string[]): number[] {
  const numbers = subjects
    .filter((s) => !/^chore\(main\): release /.test(s))
    .map((s) => /\(#(\d+)\)$/.exec(s.trim())?.[1])
    .filter((n): n is string => !!n)
    .map(Number);
  return [...new Set(numbers)];
}

/** A pull request's What's New lines, as list items; none when it says "none" or nothing. */
export function whatsNewLines(body: string): string[] {
  const m = /^## What's New[ \t]*\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(body ?? "");
  if (!m) return [];
  // Until none is left: removing one comment can join the pieces of another.
  let text = m[1]!;
  for (let prev = ""; prev !== text; ) {
    prev = text;
    text = text.replace(/<!--[\s\S]*?-->/g, "");
  }
  text = text.replace(/🤖 Generated with[^\n]*/g, "").trim();
  // "none", "None.", "none: internal only", but not "None of your drafts …".
  if (!text || /^none\b(?![ \t]+\w)/i.test(text)) return [];
  // A paragraph is one item; list items (and their continuation lines) stay as they are.
  return text
    .split(/\r?\n(?=[-*] )|\r?\n\s*\r?\n/)
    .map((item) => item.trim().replace(/^[-*] +/, "").replace(/\s*\r?\n\s*/g, " "))
    .filter(Boolean)
    .map((item) => `- ${item}`);
}

/** "21 October 2026" from "2026-10-21". */
export function releaseDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * The page with the version's section written (replacing one already there),
 * newest first under the introduction. No lines: no section for it.
 */
export function writeSection(page: string, version: string, date: string, lines: string[]): string {
  const [intro, ...sections] = page.split(/^(?=## )/m);
  const others = sections.filter((s) => !s.startsWith(`## ${version} (`) && !s.startsWith(`## ${version}\n`));
  const section = lines.length ? [`## ${version} (${releaseDate(date)})\n\n${lines.join("\n")}\n\n`] : [];
  const kept = others.map((s, i) => (i === others.length - 1 ? `${s.trimEnd()}\n` : s));
  return [intro, ...section, ...kept].join("").replace(/\n*$/, "\n");
}
