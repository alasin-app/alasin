// SPDX-License-Identifier: MIT
// Preact wrapper around the CodeMirror Markdown editor.

import { apiPath } from "../lib/current-site";
import { useEffect, useRef } from "preact/hooks";
import type { ImageTarget, MarkdownEditor } from "../editor/markdown-editor";
import { t } from "../lib/i18n";
import { settings } from "../lib/settings";
import type { SiteSettings } from "../lib/site";

export function BodyEditor(props: {
  value: string;
  rich: boolean;
  /** Someone else is editing: shown, not editable. */
  readOnly?: boolean;
  site: SiteSettings;
  onChange: (text: string) => void;
  onReady: (editor: MarkdownEditor | null) => void;
  onFiles: (files: File[]) => void;
  /** The + of a gallery or a single image. */
  onAddPhotos: (target: ImageTarget) => void;
  /** A picture's text tapped. */
  onImageText: (target: ImageTarget, title: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<MarkdownEditor | null>(null);
  // Latest callbacks, so the editor (created once) always calls the current ones.
  const onChange = useRef(props.onChange);
  const onFiles = useRef(props.onFiles);
  const onAddPhotos = useRef(props.onAddPhotos);
  const onImageText = useRef(props.onImageText);
  onChange.current = props.onChange;
  onFiles.current = props.onFiles;
  onAddPhotos.current = props.onAddPhotos;
  onImageText.current = props.onImageText;
  /** Value and mode at the time CodeMirror finishes loading. */
  /**
   * Texts the editor itself reported while the app's state catches up. Typing
   * fast, an older one of them can come back as `value` after newer keys were
   * typed; putting it back would move text past the cursor. Only values that
   * didn't come from here (photos uploaded, the text tidied on save, the
   * Markdown mode) are applied.
   */
  const emitted = useRef<string[]>([]);
  const latest = useRef({ value: props.value, rich: props.rich, readOnly: props.readOnly ?? false });
  latest.current = { value: props.value, rich: props.rich, readOnly: props.readOnly ?? false };

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    // CodeMirror is loaded only when an editor opens.
    void import("../editor/markdown-editor").then(({ createMarkdownEditor }) => {
      if (cancelled) return;
    const { media, gallery } = props.site;
    // Published photos from the media bucket; a draft's from the site's routes.
    const resolveImage = (url: string) =>
      media.contentPrefix.startsWith("/") && url.startsWith(media.contentPrefix) ? media.publicUrl + url.slice(media.contentPrefix.length) : apiPath(url);
    const ed = createMarkdownEditor({
      parent: host.current!,
      doc: latest.current.value,
      rich: latest.current.rich,
      readOnly: latest.current.readOnly,
      styleNonce: settings.styleNonce || undefined,
      gallery: gallery.shortcode,
      galleryPaired: gallery.paired,
      placeholder: t("editor.bodyPlaceholder"),
      labels: {
        moveEarlier: t("editor.moveEarlier"),
        moveLater: t("editor.moveLater"),
        remove: t("editor.removeFromGallery"),
        removeImage: t("editor.removeImage"),
        gallery: t("editor.gallery"),
        shortcode: t("editor.shortcode"),
        addPhotos: t("photos.add"),
        makeGallery: t("editor.makeGallery"),
        imageText: t("editor.imageText"),
        addText: t("editor.addImageText"),
      },
      resolveImage,
      onChange: (text) => {
        emitted.current.push(text);
        // Only the last few keystrokes can still be on their way.
        if (emitted.current.length > 50) emitted.current.splice(0, emitted.current.length - 50);
        onChange.current(text);
      },
      onAddPhotos: (target) => onAddPhotos.current(target),
      onImageText: (target, title) => onImageText.current(target, title),
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

  useEffect(() => {
    const ed = editor.current;
    if (!ed) return;
    const at = emitted.current.lastIndexOf(props.value);
    if (at !== -1) {
      // An echo of the editor's own text: nothing to apply. Older echoes can't come any more.
      emitted.current.splice(0, at + 1);
      return;
    }
    emitted.current = [];
    ed.setText(props.value);
  }, [props.value]);
  useEffect(() => editor.current?.setRich(props.rich), [props.rich]);
  useEffect(() => editor.current?.setReadOnly(props.readOnly ?? false), [props.readOnly]);

  return <div ref={host} class="md-editor" aria-label={t("editor.text")} />;
}
