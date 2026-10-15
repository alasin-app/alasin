// SPDX-License-Identifier: MIT
// Preact wrapper around the CodeMirror Markdown editor.

import { useEffect, useRef } from "preact/hooks";
import type { MarkdownEditor } from "../editor/markdown-editor";
import { t } from "../lib/i18n";
import { settings } from "../lib/settings";
import type { SiteSettings } from "../lib/site";

export function BodyEditor(props: {
  value: string;
  rich: boolean;
  site: SiteSettings;
  onChange: (text: string) => void;
  onReady: (editor: MarkdownEditor | null) => void;
  onFiles: (files: File[]) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<MarkdownEditor | null>(null);
  // Latest callbacks, so the editor (created once) always calls the current ones.
  const onChange = useRef(props.onChange);
  const onFiles = useRef(props.onFiles);
  onChange.current = props.onChange;
  onFiles.current = props.onFiles;
  /** Value and mode at the time CodeMirror finishes loading. */
  const latest = useRef({ value: props.value, rich: props.rich });
  latest.current = { value: props.value, rich: props.rich };

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    // CodeMirror is loaded only when an editor opens.
    void import("../editor/markdown-editor").then(({ createMarkdownEditor }) => {
      if (cancelled) return;
    const { media, gallery } = props.site;
    const resolveImage = (url: string) =>
      media.contentPrefix.startsWith("/") && url.startsWith(media.contentPrefix) ? media.publicUrl + url.slice(media.contentPrefix.length) : url;
    const ed = createMarkdownEditor({
      parent: host.current!,
      doc: latest.current.value,
      rich: latest.current.rich,
      styleNonce: settings.styleNonce || undefined,
      gallery: gallery.shortcode,
      placeholder: t("editor.bodyPlaceholder"),
      labels: {
        moveEarlier: t("editor.moveEarlier"),
        moveLater: t("editor.moveLater"),
        remove: t("editor.removeFromGallery"),
        removeImage: t("editor.removeImage"),
        gallery: t("editor.gallery"),
        shortcode: t("editor.shortcode"),
      },
      resolveImage,
      onChange: (text) => onChange.current(text),
    });
    editor.current = ed;
    props.onReady(ed);

    // Photos dropped or pasted into the text: handled before CodeMirror sees them.
    const isPhoto = (f: File) => f.type.startsWith("image/") || /\.hei[cf]$/i.test(f.name);
    const onDrop = (e: DragEvent) => {
      const files = [...(e.dataTransfer?.files ?? [])].filter(isPhoto);
      if (!files.length) return;
      e.preventDefault();
      e.stopPropagation();
      const pos = ed.view.posAtCoords({ x: e.clientX, y: e.clientY });
      if (pos !== null) ed.view.dispatch({ selection: { anchor: pos } });
      onFiles.current(files);
    };
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter(isPhoto);
      if (!files.length) return;
      e.preventDefault();
      e.stopPropagation();
      onFiles.current(files);
    };
    const el = host.current!;
    el.addEventListener("drop", onDrop, true);
    el.addEventListener("paste", onPaste, true);
    cleanup = () => {
      el.removeEventListener("drop", onDrop, true);
      el.removeEventListener("paste", onPaste, true);
      props.onReady(null);
      ed.destroy();
      editor.current = null;
    };
    });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  useEffect(() => editor.current?.setText(props.value), [props.value]);
  useEffect(() => editor.current?.setRich(props.rich), [props.rich]);

  return <div ref={host} class="md-editor" aria-label={t("editor.text")} />;
}
