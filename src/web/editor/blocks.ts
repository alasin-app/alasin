// SPDX-License-Identifier: MIT
//
// Hugo shortcodes in the text: galleries (shown as editable cards) and other
// shortcodes (shown as protected blocks). Only the parts the user changes are
// rewritten; everything else stays exactly as written.

export interface GalleryImage {
  /** The image's Markdown exactly as written, e.g. ![alt](/img/a.jpg "Caption"). */
  markdown: string;
  alt: string;
  url: string;
  /** The image's title text ("" if none), shown with the picture on the site. */
  title: string;
}

export interface GalleryBlock {
  from: number;
  to: number;
  /** The opening tag line as written, parameters included. */
  open: string;
  close: string;
  images: GalleryImage[];
  /** False if the block contains anything besides images and blank lines (then it's shown, not edited). */
  editable: boolean;
}

export interface ShortcodeBlock {
  from: number;
  to: number;
  name: string;
  text: string;
}

const IMAGE = /^!\[([^\]]*)\]\((\S+?)(?:\s+"((?:[^"\\]|\\.)*)")?\)$/;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Paired gallery blocks: {{< name … >}} … {{< /name >}}. */
export function findGalleries(text: string, name: string): GalleryBlock[] {
  const out: GalleryBlock[] = [];
  const re = new RegExp(`^\\{\\{[<%]\\s*${escape(name)}(?:\\s[^\\n]*?)?\\s*[>%]\\}\\}[ \\t]*$([\\s\\S]*?)^\\{\\{[<%]\\s*/${escape(name)}\\s*[>%]\\}\\}[ \\t]*$`, "gm");
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const inner = m[1]!;
    const open = m[0].slice(0, m[0].indexOf("\n") === -1 ? m[0].length : m[0].indexOf("\n"));
    const close = m[0].slice(m[0].lastIndexOf("\n") + 1);
    const images: GalleryImage[] = [];
    let editable = true;
    for (const line of inner.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      const im = IMAGE.exec(t);
      if (im) images.push({ markdown: t, alt: im[1]!, url: im[2]!, title: unescapeTitle(im[3]) });
      else editable = false;
    }
    out.push({ from: m.index, to: m.index + m[0].length, open, close, images, editable });
  }
  return out;
}

/** The gallery's text with images in the given order (blank line between them, as the site writes them). */
export function galleryText(block: Pick<GalleryBlock, "open" | "close">, images: GalleryImage[]): string {
  return images.length ? `${block.open}\n\n${images.map((i) => i.markdown).join("\n\n")}\n\n${block.close}` : "";
}

/** Shortcode tags other than the gallery, each line as one protected block. */
export function findShortcodes(text: string, except: string): ShortcodeBlock[] {
  const out: ShortcodeBlock[] = [];
  const re = /^\{\{[<%]\s*\/?\s*([A-Za-z0-9_-]+)[^\n]*?[>%]\}\}[ \t]*$/gm;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m[1] === except) continue;
    out.push({ from: m.index, to: m.index + m[0].length, name: m[1]!, text: m[0] });
  }
  return out;
}

/** A line that is just one image. */
export function standaloneImage(line: string): { alt: string; url: string; title: string } | null {
  const m = IMAGE.exec(line.trim());
  return m ? { alt: m[1]!, url: m[2]!, title: unescapeTitle(m[3]) } : null;
}

const unescapeTitle = (raw: string | undefined) => (raw ?? "").replace(/\\(.)/g, "$1");

/**
 * The image's Markdown with its title text set (or removed when empty). The
 * alt text and address stay exactly as written.
 */
export function withImageTitle(markdown: string, title: string): string {
  const m = IMAGE.exec(markdown.trim());
  if (!m) return markdown;
  const text = title.replace(/\s+/g, " ").trim();
  const quoted = text ? ` "${text.replace(/[\\"]/g, "\\$&")}"` : "";
  return `![${m[1]!}](${m[2]!}${quoted})`;
}

/** A new gallery around existing image Markdown, as photos are added to it. */
export function newGalleryText(name: string, images: string[]): string {
  return galleryText({ open: `{{< ${name} >}}`, close: `{{< /${name} >}}` }, images.map((markdown) => ({ markdown, alt: "", url: "", title: "" })));
}

export interface TextChange {
  from: number;
  to: number;
  insert: string;
}

/** Where photos are added or a picture's text is edited: a gallery (from its start) or a single image (from its line's start). */
export interface ImageTarget {
  pos: number;
  /** The image within the gallery, or null for a single image (or the gallery itself). */
  index: number | null;
}

/** The lines between `from` and `to` that are just one image. */
function imageLines(text: string, from: number, to: number): { from: number; to: number; text: string }[] {
  const out: { from: number; to: number; text: string }[] = [];
  for (let start = from; start <= to; ) {
    const nl = text.indexOf("\n", start);
    const end = nl === -1 || nl > to ? to : nl;
    const line = text.slice(start, end);
    if (IMAGE.test(line.trim())) out.push({ from: start, to: end, text: line });
    start = end + 1;
  }
  return out;
}

/** The single image on the line starting at `pos` (not one inside a gallery). */
function singleImageAt(text: string, name: string, pos: number) {
  if (pos < 0 || pos > text.length || (pos > 0 && text[pos - 1] !== "\n")) return null;
  if (findGalleries(text, name).some((g) => pos > g.from && pos < g.to)) return null;
  const nl = text.indexOf("\n", pos);
  const line = { from: pos, to: nl === -1 ? text.length : nl, text: text.slice(pos, nl === -1 ? text.length : nl) };
  return standaloneImage(line.text) ? line : null;
}

/**
 * Adds images (their Markdown) to the gallery starting at `pos`, or makes the
 * single image on the line starting at `pos` a gallery with them. Null if
 * neither is there any more.
 */
export function addImagesAt(text: string, name: string, pos: number, images: string[]): TextChange | null {
  const g = findGalleries(text, name).find((b) => b.from === pos && b.editable);
  if (g) return { from: g.from, to: g.to, insert: galleryText(g, [...g.images, ...images.map((markdown) => ({ markdown, alt: "", url: "", title: "" }))]) };
  const line = singleImageAt(text, name, pos);
  if (line) return { from: line.from, to: line.to, insert: newGalleryText(name, [line.text.trim(), ...images]) };
  return null;
}

/** Sets the title text of the image at `target`, changing only that image's line. Null if it isn't there any more. */
export function setImageTitleAt(text: string, name: string, target: ImageTarget, title: string): TextChange | null {
  let line: { from: number; to: number; text: string } | null | undefined;
  if (target.index === null) line = singleImageAt(text, name, target.pos);
  else {
    const g = findGalleries(text, name).find((b) => b.from === target.pos && b.editable);
    line = g ? imageLines(text, g.from, g.to)[target.index] : null;
  }
  if (!line) return null;
  const lead = /^\s*/.exec(line.text)![0];
  const insert = lead + withImageTitle(line.text, title);
  return insert === line.text ? null : { from: line.from, to: line.to, insert };
}
