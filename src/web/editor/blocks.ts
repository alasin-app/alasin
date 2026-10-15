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

const IMAGE = /^!\[([^\]]*)\]\((\S+?)(?:\s+"[^"]*")?\)$/;
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
      if (im) images.push({ markdown: t, alt: im[1]!, url: im[2]! });
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
export function standaloneImage(line: string): { alt: string; url: string } | null {
  const m = IMAGE.exec(line.trim());
  return m ? { alt: m[1]!, url: m[2]! } : null;
}
