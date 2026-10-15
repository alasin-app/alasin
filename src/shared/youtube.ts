// SPDX-License-Identifier: MIT
//
// YouTube videos in posts: Hugo's built-in `youtube` shortcode takes the
// video's 11-character ID. The editor accepts a link in any of YouTube's usual
// forms, or the ID itself.

const ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"]);

/** The video ID from a YouTube link or a plain ID, or null if it isn't one. */
export function youtubeId(input: string): string | null {
  const text = input.trim();
  if (ID.test(text)) return text;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);
  let id: string | null | undefined;
  if (host === "youtu.be" || host === "www.youtu.be") id = parts[0];
  else if (HOSTS.has(host)) {
    if (parts[0] === "watch") id = url.searchParams.get("v");
    else if (["embed", "shorts", "live", "v", "e"].includes(parts[0] ?? "")) id = parts[1];
    else if (parts.length === 0) id = url.searchParams.get("v");
  }
  return id && ID.test(id) ? id : null;
}

/** The shortcode for a video. */
export function youtubeShortcode(id: string): string {
  return `{{< youtube ${id} >}}`;
}

/** The video ID of a `youtube` shortcode line (positional or `id=`), or null. */
export function shortcodeYoutubeId(line: string): string | null {
  const m = /^\{\{[<%]\s*youtube\s+(?:id\s*=\s*)?["']?([A-Za-z0-9_-]{11})["']?(?:\s[^\n]*?)?\s*[>%]\}\}\s*$/.exec(line.trim());
  return m ? m[1]! : null;
}

/** The video's thumbnail, for the editor's preview. */
export function youtubeThumbnail(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/**
 * A YouTube link pasted on a line of its own, as the shortcode (separated
 * from neighbouring text by blank lines), or null to paste the text as is.
 * A bare ID is not converted: it could be any 11-letter word.
 */
export function pastedVideo(text: string, before: string, after: string): string | null {
  const link = text.trim();
  if (/\s/.test(link) || youtubeId(link) === link) return null;
  const video = youtubeId(link);
  if (!video) return null;
  const lineBefore = before.slice(before.lastIndexOf("\n") + 1);
  const newline = after.indexOf("\n");
  const lineAfter = newline < 0 ? after : after.slice(0, newline);
  if (lineBefore.trim() || lineAfter.trim()) return null;
  const head = before.slice(0, before.length - lineBefore.length);
  const tail = newline < 0 ? "" : after.slice(newline);
  const lead = head.trim() === "" || head.endsWith("\n\n") ? "" : "\n";
  const trail = tail === "" || tail.startsWith("\n\n") ? "" : "\n";
  return lead + youtubeShortcode(video) + trail;
}
