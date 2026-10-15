// SPDX-License-Identifier: MIT
//
// The text editor: CodeMirror 6 on the Markdown itself. The Markdown is the
// document — nothing is converted back and forth, so a post's text changes
// only where the user types. In "rich" mode, live formatting shows it like a
// rich-text editor: headings, bold, italic and links formatted with their
// markers hidden (except where the cursor is), bullets for list markers, a bar
// for quotes, ↵ for line breaks, images inline, galleries as cards that can be
// reordered, and other shortcodes as protected blocks. "markdown" mode shows
// the plain text.

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { defineLanguageFacet, Language, LanguageSupport, syntaxTree } from "@codemirror/language";
import { GFM, parser as markdownParser } from "@lezer/markdown";
import { Annotation, Compartment, EditorSelection, EditorState, type Extension, RangeSetBuilder, StateField, type Text } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  placeholder as placeholderExt,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { continueBlock } from "../lib/continue-block";
import { findGalleries, findShortcodes, galleryText, type GalleryBlock, type GalleryImage, standaloneImage } from "./blocks";

export interface EditorOptions {
  parent: HTMLElement;
  doc: string;
  rich: boolean;
  /** Nonce for CodeMirror's runtime <style> elements (Content-Security-Policy). */
  styleNonce?: string;
  gallery: string;
  placeholder: string;
  labels: { moveEarlier: string; moveLater: string; remove: string; removeImage: string; gallery: string; lineBreak: string; shortcode: string };
  /** Image address to show for a Markdown image URL (e.g. /img/… → media domain). */
  resolveImage: (url: string) => string;
  onChange: (text: string) => void;
}

/**
 * Markdown (with GitHub's tables and strikethrough) straight from the Lezer
 * parser. @codemirror/lang-markdown would also bundle HTML, CSS and JavaScript
 * parsers for code blocks, which this editor doesn't need.
 */
const markdownLanguage = new LanguageSupport(new Language(defineLanguageFacet(), markdownParser.configure(GFM), [], "markdown"));

/** Marks changes coming from outside (not typed), so they aren't reported back. */
const External = Annotation.define<boolean>();

// ---------- Text changes ----------

/** Replaces the document with `next` as one minimal change (keeps undo history and scroll). */
function minimalChange(doc: Text, next: string) {
  const prev = doc.toString();
  if (prev === next) return null;
  let start = 0;
  while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
  let endPrev = prev.length;
  let endNext = next.length;
  while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) {
    endPrev--;
    endNext--;
  }
  return { from: start, to: endPrev, insert: next.slice(start, endNext) };
}

function enter(view: EditorView): boolean {
  const sel = view.state.selection.main;
  if (!sel.empty) return false;
  const r = continueBlock(view.state.doc.toString(), sel.head);
  if (!r) return false;
  const change = minimalChange(view.state.doc, r.text);
  if (!change) return false;
  view.dispatch({ changes: change, selection: EditorSelection.cursor(r.cursor), scrollIntoView: true, userEvent: "input" });
  return true;
}

/** Shift+Enter: a line break inside the paragraph (two trailing spaces), keeping a quote or list item going. */
function lineBreak(view: EditorView): boolean {
  const sel = view.state.selection.main;
  const line = view.state.doc.lineAt(sel.head);
  const quote = /^(\s*>\s?)/.exec(line.text);
  const item = /^(\s*(?:[-*+]|\d{1,9}[.)])\s+)/.exec(line.text);
  const cont = quote ? quote[1]! : item ? " ".repeat(item[1]!.length) : "";
  const before = view.state.doc.sliceString(line.from, sel.from).replace(/[ \t]+$/, "");
  const insert = `  \n${cont}`;
  const from = line.from + before.length;
  view.dispatch({ changes: { from, to: sel.to, insert }, selection: EditorSelection.cursor(from + insert.length), scrollIntoView: true, userEvent: "input" });
  return true;
}

export function wrapSelection(view: EditorView, before: string, after: string, sample: string) {
  const sel = view.state.selection.main;
  const text = view.state.sliceDoc(sel.from, sel.to) || sample;
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: before + text + after },
    selection: EditorSelection.range(sel.from + before.length, sel.from + before.length + text.length),
    userEvent: "input",
  });
  view.focus();
}

export function prefixLines(view: EditorView, prefix: string) {
  const sel = view.state.selection.main;
  const first = view.state.doc.lineAt(sel.from);
  const last = view.state.doc.lineAt(sel.to);
  const changes = [];
  for (let n = first.number; n <= last.number; n++) {
    const line = view.state.doc.line(n);
    if (!line.text.startsWith(prefix)) changes.push({ from: line.from, insert: prefix });
  }
  view.dispatch({ changes, userEvent: "input" });
  view.focus();
}

/** Inserts text at the cursor (or the end), as its own block separated by blank lines. */
export function insertBlock(view: EditorView, text: string, at?: number) {
  const doc = view.state.doc;
  const pos = Math.min(at ?? view.state.selection.main.head, doc.length);
  const before = doc.sliceString(0, pos);
  const after = doc.sliceString(pos);
  const lead = before.trim() === "" ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const trail = after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  const insert = lead + text + trail;
  view.dispatch({ changes: { from: pos, insert }, selection: EditorSelection.cursor(pos + insert.length), scrollIntoView: true, userEvent: "input" });
}

// ---------- Widgets ----------

class BulletWidget extends WidgetType {
  override eq() {
    return true;
  }
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-md-bullet";
    s.textContent = "•";
    return s;
  }
}

class RuleWidget extends WidgetType {
  override eq() {
    return true;
  }
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-md-rule";
    s.setAttribute("role", "separator");
    return s;
  }
}

class BreakWidget extends WidgetType {
  constructor(readonly label: string) {
    super();
  }
  override eq(o: BreakWidget) {
    return o.label === this.label;
  }
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-md-break";
    s.textContent = "↵";
    s.title = this.label;
    return s;
  }
}

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly pos: number,
    readonly removeLabel: string,
  ) {
    super();
  }
  override eq(o: ImageWidget) {
    return o.src === this.src && o.alt === this.alt && o.pos === this.pos;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("div");
    wrap.className = "cm-md-image";
    const img = document.createElement("img");
    img.src = this.src;
    img.alt = this.alt;
    img.loading = "lazy";
    wrap.appendChild(img);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "cm-md-image-remove";
    remove.textContent = "✕";
    remove.title = this.removeLabel;
    remove.setAttribute("aria-label", this.removeLabel);
    remove.addEventListener("mousedown", (e) => e.preventDefault());
    remove.addEventListener("click", (e) => {
      e.preventDefault();
      // Remove the image's line together with one blank line around it.
      const line = view.state.doc.lineAt(Math.min(this.pos, view.state.doc.length));
      let from = line.from;
      let to = Math.min(line.to + 1, view.state.doc.length);
      if (view.state.doc.sliceString(to, to + 1) === "\n") to += 1;
      else if (from > 0 && view.state.doc.sliceString(from - 2, from) === "\n\n") from -= 1;
      view.dispatch({ changes: { from, to }, userEvent: "delete" });
    });
    wrap.appendChild(remove);
    // Clicking the image puts the cursor right after it.
    wrap.addEventListener("mousedown", (e) => {
      if (e.target === remove) return;
      e.preventDefault();
      const line = view.state.doc.lineAt(Math.min(this.pos, view.state.doc.length));
      view.dispatch({ selection: EditorSelection.cursor(line.to) });
      view.focus();
    });
    return wrap;
  }
  override ignoreEvent() {
    return true;
  }
}

class ShortcodeWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly label: string,
  ) {
    super();
  }
  override eq(o: ShortcodeWidget) {
    return o.text === this.text;
  }
  toDOM() {
    const d = document.createElement("div");
    d.className = "cm-md-shortcode";
    d.title = this.label;
    d.textContent = this.text;
    return d;
  }
  override ignoreEvent() {
    return true;
  }
}

class GalleryWidget extends WidgetType {
  constructor(
    readonly block: GalleryBlock,
    readonly opts: EditorOptions,
  ) {
    super();
  }
  override eq(o: GalleryWidget) {
    return o.block.from === this.block.from && o.block.to === this.block.to && o.block.images.map((i) => i.markdown).join() === this.block.images.map((i) => i.markdown).join();
  }
  private replace(view: EditorView, images: GalleryImage[]) {
    // The block may have moved since the widget was drawn: find it again by position.
    const current = findGalleries(view.state.doc.toString(), this.opts.gallery).find((g) => g.from === this.block.from);
    if (!current) return;
    const text = galleryText(current, images);
    let to = current.to;
    // Removing the last image removes the whole gallery and the blank line after it.
    if (!text && view.state.doc.sliceString(to, to + 2) === "\n\n") to += 1;
    if (!text && view.state.doc.sliceString(to, to + 1) === "\n") to += 1;
    view.dispatch({ changes: { from: current.from, to, insert: text }, userEvent: "input" });
  }
  toDOM(view: EditorView) {
    const { labels } = this.opts;
    const wrap = document.createElement("div");
    wrap.className = "cm-md-gallery";
    const head = document.createElement("div");
    head.className = "cm-md-gallery-head";
    head.textContent = `${labels.gallery} · ${this.block.images.length}`;
    wrap.appendChild(head);
    const grid = document.createElement("div");
    grid.className = "cm-md-gallery-grid";
    const images = this.block.images;
    let dragged = -1;
    images.forEach((image, i) => {
      const fig = document.createElement("figure");
      fig.draggable = true;
      const img = document.createElement("img");
      img.src = this.opts.resolveImage(image.url);
      img.alt = image.alt;
      img.loading = "lazy";
      img.draggable = false;
      fig.appendChild(img);
      const bar = document.createElement("div");
      bar.className = "cm-md-gallery-bar";
      const button = (text: string, label: string, onClick: () => void, disabled = false) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = text;
        b.setAttribute("aria-label", label);
        b.title = label;
        b.disabled = disabled;
        b.addEventListener("mousedown", (e) => e.preventDefault());
        b.addEventListener("click", (e) => {
          e.preventDefault();
          onClick();
        });
        bar.appendChild(b);
      };
      const move = (to: number) => {
        const next = [...images];
        const [it] = next.splice(i, 1);
        next.splice(to, 0, it!);
        this.replace(view, next);
      };
      button("‹", labels.moveEarlier, () => move(i - 1), i === 0);
      button("›", labels.moveLater, () => move(i + 1), i === images.length - 1);
      button("✕", labels.remove, () => this.replace(view, images.filter((_, k) => k !== i)));
      fig.appendChild(bar);
      fig.addEventListener("dragstart", (e) => {
        dragged = i;
        e.dataTransfer?.setData("text/plain", String(i));
        fig.classList.add("dragging");
      });
      fig.addEventListener("dragend", () => fig.classList.remove("dragging"));
      fig.addEventListener("dragover", (e) => e.preventDefault());
      fig.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (dragged < 0 || dragged === i) return;
        const next = [...images];
        const [it] = next.splice(dragged, 1);
        next.splice(i, 0, it!);
        this.replace(view, next);
      });
      grid.appendChild(fig);
    });
    wrap.appendChild(grid);
    return wrap;
  }
  override ignoreEvent() {
    return true;
  }
}

// ---------- Live formatting ----------

/** Block widgets (galleries, shortcodes, standalone images) come from a state field. */
function blockDecorations(opts: EditorOptions) {
  const build = (state: EditorState): DecorationSet => {
    const text = state.doc.toString();
    const ranges: { from: number; to: number; deco: Decoration }[] = [];
    const galleries = findGalleries(text, opts.gallery).filter((g) => g.editable);
    const inGallery = (pos: number) => galleries.some((g) => pos >= g.from && pos <= g.to);
    for (const g of galleries) {
      ranges.push({ from: g.from, to: g.to, deco: Decoration.replace({ widget: new GalleryWidget(g, opts), block: true }) });
    }
    for (const s of findShortcodes(text, opts.gallery)) {
      if (inGallery(s.from)) continue;
      ranges.push({ from: s.from, to: s.to, deco: Decoration.replace({ widget: new ShortcodeWidget(s.text, opts.labels.shortcode), block: true }) });
    }
    for (let n = 1; n <= state.doc.lines; n++) {
      const line = state.doc.line(n);
      if (inGallery(line.from)) continue;
      const img = standaloneImage(line.text);
      if (img && !img.url.startsWith("alasin-upload:")) {
        ranges.push({
          from: line.from,
          to: line.to,
          deco: Decoration.replace({ widget: new ImageWidget(opts.resolveImage(img.url), img.alt, line.from, opts.labels.removeImage), block: true }),
        });
      }
    }
    ranges.sort((a, b) => a.from - b.from || a.to - b.to);
    const b = new RangeSetBuilder<Decoration>();
    let last = -1;
    for (const r of ranges) {
      if (r.from < last) continue;
      b.add(r.from, r.to, r.deco);
      last = r.to;
    }
    return b.finish();
  };
  const field = StateField.define<DecorationSet>({
    create: build,
    update: (deco, tr) => (tr.docChanged ? build(tr.state) : deco),
    provide: (f) => [EditorView.decorations.from(f), EditorView.atomicRanges.of((view) => view.state.field(f))],
  });
  return field;
}

const hide = Decoration.replace({});

/** Inline formatting from the Markdown syntax tree, for the visible part of the document. */
function inlineDecorations(opts: EditorOptions) {
  const bullet = Decoration.replace({ widget: new BulletWidget() });
  const rule = Decoration.replace({ widget: new RuleWidget() });
  const lineBreakWidget = Decoration.replace({ widget: new BreakWidget(opts.labels.lineBreak) });
  const mark = (cls: string) => Decoration.mark({ class: cls });
  const lineDeco = (cls: string) => Decoration.line({ class: cls });

  const build = (view: EditorView): DecorationSet => {
    const { state } = view;
    const sel = state.selection.ranges;
    // Markers show only where the user is editing: never while the editor isn't focused.
    const focused = view.hasFocus;
    const touches = (from: number, to: number) => focused && sel.some((r) => r.from <= to && r.to >= from);
    const items: { from: number; to: number; deco: Decoration }[] = [];
    for (const { from, to } of view.visibleRanges) {
      syntaxTree(state).iterate({
        from,
        to,
        enter: (node) => {
          const n = node.name;
          const h = /^ATXHeading(\d)$/.exec(n);
          if (h) {
            items.push({ from: state.doc.lineAt(node.from).from, to: state.doc.lineAt(node.from).from, deco: lineDeco(`cm-md-h cm-md-h${h[1]}`) });
            return;
          }
          if (n === "HeaderMark") {
            if (!touches(node.from, node.to + 1)) {
              const after = state.doc.sliceString(node.to, node.to + 1) === " " ? 1 : 0;
              items.push({ from: node.from, to: node.to + after, deco: hide });
            }
            return;
          }
          if (n === "StrongEmphasis") items.push({ from: node.from, to: node.to, deco: mark("cm-md-strong") });
          if (n === "Emphasis") items.push({ from: node.from, to: node.to, deco: mark("cm-md-em") });
          if (n === "Strikethrough") items.push({ from: node.from, to: node.to, deco: mark("cm-md-strike") });
          if (n === "InlineCode") items.push({ from: node.from, to: node.to, deco: mark("cm-md-code") });
          if (n === "Link") items.push({ from: node.from, to: node.to, deco: mark("cm-md-link") });
          if (n === "EmphasisMark" || n === "CodeMark" || n === "StrikethroughMark") {
            const parent = node.node.parent;
            if (parent && parent.name !== "FencedCode" && !touches(parent.from, parent.to)) items.push({ from: node.from, to: node.to, deco: hide });
            return;
          }
          if (n === "LinkMark" || n === "URL" || n === "LinkTitle") {
            const parent = node.node.parent;
            if (parent?.name === "Link" && !touches(parent.from, parent.to)) items.push({ from: node.from, to: node.to, deco: hide });
            return;
          }
          if (n === "Blockquote") {
            for (let pos = node.from; pos <= node.to; ) {
              const l = state.doc.lineAt(pos);
              items.push({ from: l.from, to: l.from, deco: lineDeco("cm-md-quote") });
              pos = l.to + 1;
            }
            return;
          }
          if (n === "QuoteMark") {
            if (!touches(node.from, node.to + 1)) {
              const after = state.doc.sliceString(node.to, node.to + 1) === " " ? 1 : 0;
              items.push({ from: node.from, to: node.to + after, deco: hide });
            }
            return;
          }
          if (n === "ListMark") {
            const list = node.node.parent?.parent;
            if (list?.name === "BulletList" && !touches(node.from, node.to + 1)) items.push({ from: node.from, to: node.to, deco: bullet });
            return;
          }
          if (n === "HardBreak") {
            const text = state.doc.sliceString(node.from, node.to);
            const len = text.replace(/\n$/, "").length;
            if (len > 0) items.push({ from: node.from, to: node.from + len, deco: lineBreakWidget });
            return;
          }
          if (n === "HorizontalRule") {
            items.push({ from: state.doc.lineAt(node.from).from, to: state.doc.lineAt(node.from).from, deco: lineDeco("cm-md-hr") });
            // A line across, unless the cursor is on it.
            if (!touches(node.from, node.to)) items.push({ from: node.from, to: node.to, deco: rule });
            return;
          }
          if (n === "FencedCode") {
            for (let pos = node.from; pos <= node.to; ) {
              const l = state.doc.lineAt(pos);
              items.push({ from: l.from, to: l.from, deco: lineDeco("cm-md-codeblock") });
              pos = l.to + 1;
            }
            return false;
          }
          return;
        },
      });
    }
    // RangeSetBuilder needs sorted input; line decorations (zero length) first at a position.
    items.sort((a, b) => a.from - b.from || (a.to - a.from) - (b.to - b.from) || a.to - b.to);
    const b = new RangeSetBuilder<Decoration>();
    let lastReplaceEnd = -1;
    for (const it of items) {
      const isReplace = it.from !== it.to && (it.deco.spec.widget !== undefined || it.deco === hide);
      if (isReplace) {
        if (it.from < lastReplaceEnd) continue;
        lastReplaceEnd = it.to;
      }
      b.add(it.from, it.to, it.deco);
    }
    return b.finish();
  };

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.selectionSet || u.viewportChanged || u.focusChanged) this.decorations = build(u.view);
      }
    },
    { decorations: (v) => v.decorations },
  );
}

function richExtensions(opts: EditorOptions): Extension {
  return [inlineDecorations(opts), blockDecorations(opts), EditorView.editorAttributes.of({ class: "cm-rich" })];
}

export interface MarkdownEditor {
  view: EditorView;
  setText: (text: string) => void;
  setRich: (rich: boolean) => void;
  /** Wraps the selection (or a sample word) in markers, e.g. ** for bold. */
  wrap: (before: string, after: string, sample: string) => void;
  /** Adds a prefix to the selected lines, e.g. "## " or "- ". */
  prefix: (prefix: string) => void;
  /** Inserts a block of text at the cursor, separated by blank lines. */
  insertBlock: (text: string) => void;
  destroy: () => void;
}

export function createMarkdownEditor(opts: EditorOptions): MarkdownEditor {
  const live = new Compartment();
  const view = new EditorView({
    parent: opts.parent,
    state: EditorState.create({
      doc: opts.doc,
      extensions: [
        ...(opts.styleNonce ? [EditorView.cspNonce.of(opts.styleNonce)] : []),
        history(),
        keymap.of([
          { key: "Enter", run: enter },
          { key: "Shift-Enter", run: lineBreak },
          { key: "Mod-b", run: (v) => (wrapSelection(v, "**", "**", ""), true) },
          { key: "Mod-i", run: (v) => (wrapSelection(v, "_", "_", ""), true) },
          ...historyKeymap,
          ...defaultKeymap,
        ]),
        markdownLanguage,
        EditorView.lineWrapping,
        placeholderExt(opts.placeholder),
        EditorView.contentAttributes.of({ autocapitalize: "sentences", autocorrect: "on", spellcheck: "true", "aria-multiline": "true" }),
        live.of(opts.rich ? richExtensions(opts) : []),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !u.transactions.some((t) => t.annotation(External))) opts.onChange(u.state.doc.toString());
        }),
      ],
    }),
  });
  return {
    view,
    setText(text) {
      const change = minimalChange(view.state.doc, text);
      if (change) view.dispatch({ changes: change, annotations: External.of(true) });
    },
    setRich(rich) {
      view.dispatch({ effects: live.reconfigure(rich ? richExtensions(opts) : []) });
    },
    wrap: (before, after, sample) => wrapSelection(view, before, after, sample),
    prefix: (p) => prefixLines(view, p),
    insertBlock: (text) => insertBlock(view, text),
    destroy() {
      view.destroy();
    },
  };
}
