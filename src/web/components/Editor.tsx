// SPDX-License-Identifier: MIT
//
// Editing a draft: title, details (front matter as a form) and the text.
// Typing autosaves on this device; "Save draft" commits to the site
// repository. If the draft changed on GitHub meanwhile, the user chooses
// which version to keep — nothing is overwritten silently.

import { Bold, Check, ChevronLeft, FileCode, Heading2, ImageOff, ImagePlus, Italic, Link, List, Quote, RotateCw, TvMinimalPlay, X } from "lucide-preact";
import { PhotoError, photosMarkdown, processPhoto, uploadPhoto } from "../lib/photos";
import type { MarkdownEditor } from "../editor/markdown-editor";
import { BodyEditor } from "./BodyEditor";
import { dropDanglingBreaks } from "../lib/line-breaks";
import { removeEmptyItems } from "../lib/markdown-cleanup";
import { useVisibleTop } from "../lib/visual-viewport";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { fromLocalInput, slugify, toLocalInput } from "../../shared/frontmatter";
import { youtubeId, youtubeShortcode } from "../../shared/youtube";
import { api, ApiError, type Me, NetworkError } from "../lib/api";
import { type DraftDoc, type DraftForm, newDraft, parseDraft, serializeDraft } from "../lib/draft-model";
import { t, useLanguage } from "../lib/i18n";
import { deleteLocalDraft, getLocalDraft, putLocalDraft } from "../lib/local-drafts";
import { type DraftKind, navigate } from "../lib/router";
import { loadSite, type SiteSettings } from "../lib/site";
import { ActionSheet, Sheet } from "./Sheet";

interface Loaded {
  site: SiteSettings;
  doc: DraftDoc;
  /** Blob SHA of the GitHub version the edits are based on (null: not on GitHub yet). */
  sha: string | null;
  /** Text last saved to GitHub. */
  savedContent: string | null;
  notice: "restored" | "conflict" | null;
  /** The GitHub version, when it differs from unsaved changes on this device. */
  remote?: { content: string; sha: string };
}

type Status = "idle" | "saving" | "saved" | "error";

interface Upload {
  token: string;
  file: File;
  name: string;
  state: "processing" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
}

/** Placeholder address for an image still uploading (never saved: saving waits for uploads). */
const placeholder = (token: string) => `alasin-upload:${token}`;

async function load(me: Me, type: DraftKind, id: string): Promise<Loaded> {
  const site = await loadSite();
  let remote: { content: string; sha: string } | null = null;
  try {
    remote = await api<{ content: string; sha: string }>(`/api/drafts/${type}/${id}`);
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 404)) throw err;
  }
  const local = await getLocalDraft(me.user.id, type, id);
  const fromText = (text: string) => parseDraft(text, site) ?? newDraft(id, site);

  if (remote && local && local.content !== remote.content) {
    if (local.baseSha === remote.sha) {
      return { site, doc: fromText(local.content), sha: remote.sha, savedContent: remote.content, notice: "restored" };
    }
    return { site, doc: fromText(local.content), sha: local.baseSha, savedContent: local.savedContent, notice: "conflict", remote };
  }
  if (remote) return { site, doc: fromText(remote.content), sha: remote.sha, savedContent: remote.content, notice: null };
  if (local) return { site, doc: fromText(local.content), sha: null, savedContent: null, notice: local.content ? "restored" : null };
  return { site, doc: newDraft(id, site), sha: null, savedContent: null, notice: null };
}

export function Editor(props: { me: Me; type: DraftKind; id: string }) {
  useLanguage();
  const { me, type, id } = props;
  const [state, setState] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoLink, setVideoLink] = useState("");
  const [videoError, setVideoError] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<MarkdownEditor | null>(null);
  const [mode, setMode] = useState<"rich" | "markdown">("rich");
  /** The whole file as text while in Markdown mode. */
  const [markdownText, setMarkdownText] = useState("");
  const [markdownError, setMarkdownError] = useState(false);

  useVisibleTop();

  const uploading = uploads.some((u) => u.state === "processing" || u.state === "uploading");
  const [draftImages, setDraftImages] = useState<{ file: string; url: string; thumb: string }[] | null>(null);

  const openVideo = () => {
    setVideoLink("");
    setVideoError(false);
    setVideoOpen(true);
  };

  useEffect(() => {
    // After the sheet has focused its first button: start in the link field.
    if (videoOpen) document.getElementById("video-link")?.focus();
  }, [videoOpen]);

  const addVideo = () => {
    const video = youtubeId(videoLink);
    if (!video) {
      setVideoError(true);
      return;
    }
    editorRef.current?.insertBlock(youtubeShortcode(video));
    setVideoOpen(false);
  };

  const openCover = () => {
    setCoverOpen(true);
    setDraftImages(null);
    api<{ images: { file: string; url: string; thumb: string }[] }>(`/api/draft-media/${id}`).then(
      (r) => setDraftImages(r.images),
      () => setDraftImages([]),
    );
  };
  const titleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    load(me, type, id).then(
      (l) => {
        if (cancelled) return;
        setState(l);
        setConflict(l.notice === "conflict");
        if (!l.doc.form.title) setTimeout(() => titleRef.current?.focus(), 50);
      },
      (err: unknown) => !cancelled && setLoadError(err instanceof NetworkError ? t("error.network") : t("error.generic")),
    );
    return () => void (cancelled = true);
  }, [type, id]);

  const content = useMemo(() => (state ? serializeDraft(state.doc, state.site) : ""), [state]);
  const unsaved = state !== null && content !== state.savedContent;

  // Autosave on this device while typing.
  useEffect(() => {
    if (!state) return;
    // An untouched new draft isn't stored.
    const empty = state.savedContent === null && !state.doc.form.title.trim() && !state.doc.form.body.trim();
    if (empty) return;
    const timer = setTimeout(() => {
      void putLocalDraft({ uid: me.user.id, type, id, content, baseSha: state.sha, savedContent: state.savedContent });
    }, 600);
    return () => clearTimeout(timer);
  }, [content]);

  const setForm = (patch: Partial<DraftForm>) =>
    setState((s) => (s ? { ...s, doc: { ...s.doc, form: { ...s.doc.form, ...patch } } } : s));
  const updateForm = (fn: (f: DraftForm) => Partial<DraftForm>) =>
    setState((s) => (s ? { ...s, doc: { ...s.doc, form: { ...s.doc.form, ...fn(s.doc.form) } } } : s));
  const patchUpload = (token: string, patch: Partial<Upload>) =>
    setUploads((list) => list.map((u) => (u.token === token ? { ...u, ...patch } : u)));

  const photoMessage = (err: unknown): string => {
    if (!(err instanceof PhotoError)) return t("photos.failed");
    switch (err.code) {
      case "heic":
        return t("photos.heic");
      case "unsupported":
      case "decode":
        return t("photos.unsupported");
      case "no_canvas":
        return t("photos.oldBrowser");
      case "too_large":
        return t("photos.tooLarge", { mb: String(state?.site.images.maxUploadMb ?? "") });
      case "gps":
        return t("photos.gps");
      case "network":
        return t("photos.network");
      default:
        return t("photos.failed");
    }
  };

  const runUpload = async (u: Upload) => {
    const site = state!.site;
    try {
      patchUpload(u.token, { state: "processing", progress: 0, error: undefined });
      const image = await processPhoto(u.file, site);
      patchUpload(u.token, { state: "uploading" });
      const done = await uploadPhoto(id, u.name, image, (p) => patchUpload(u.token, { progress: p }));
      updateForm((f) => ({
        body: f.body.split(placeholder(u.token)).join(done.url),
        ...(f.cover ? {} : { cover: done.url }),
      }));
      patchUpload(u.token, { state: "done", progress: 1 });
      setTimeout(() => setUploads((list) => list.filter((x) => x.token !== u.token)), 1500);
    } catch (err) {
      patchUpload(u.token, { state: "error", error: photoMessage(err) });
    }
  };

  const removeUpload = (token: string) => {
    setUploads((list) => list.filter((x) => x.token !== token));
    updateForm((f) => ({ body: f.body.replace(new RegExp(`!\\[\\]\\(${placeholder(token)}\\)\\n*`), "") }));
  };

  const addPhotos = (files: File[]) => {
    if (!state || !files.length) return;
    const list: Upload[] = files.map((file) => ({
      token: Math.random().toString(36).slice(2, 10),
      file,
      name: file.name || "image.jpg",
      state: "processing",
      progress: 0,
    }));
    const md = photosMarkdown(
      list.map((u) => placeholder(u.token)),
      state.site.gallery,
    );
    if (editorRef.current) editorRef.current.insertBlock(md);
    else updateForm((f) => ({ body: `${f.body.replace(/\s+$/, "")}\n\n${md}\n` }));
    setUploads((u) => [...u, ...list]);
    // Two photos at a time.
    const queue = [...list];
    const next = async (): Promise<void> => {
      const u = queue.shift();
      if (!u) return;
      await runUpload(u);
      return next();
    };
    void next();
    void next();
  };

  const onTitle = (title: string) => {
    const f = state!.doc.form;
    // The slug follows the title until it's edited by hand.
    const slugFollows = !f.slug || f.slug === slugify(f.title);
    setForm({ title, ...(slugFollows ? { slug: title.trim() ? slugify(title) : "" } : {}) });
  };

  const save = async (opts: { overwrite?: boolean } = {}) => {
    if (!state || status === "saving") return;
    if (uploading) {
      setMessage(t("photos.waitForUploads"));
      return;
    }
    if (!state.doc.form.title.trim()) {
      setMessage(t("editor.needTitle"));
      titleRef.current?.focus();
      return;
    }
    setStatus("saving");
    setMessage(null);
    // Tidy up list items and quote lines left empty while writing.
    // (Markdown mode is raw: nothing is changed there.)
    const body = mode === "rich" ? dropDanglingBreaks(removeEmptyItems(state.doc.form.body)) : state.doc.form.body;
    const doc = body === state.doc.form.body ? state.doc : { ...state.doc, form: { ...state.doc.form, body } };
    const toSave = serializeDraft(doc, state.site);
    let sha = state.sha;
    try {
      if (opts.overwrite) {
        sha = (await api<{ sha: string }>(`/api/drafts/${type}/${id}`)).sha;
      }
      const res = await api<{ sha: string }>(`/api/drafts/${type}/${id}`, {
        method: "PUT",
        body: { content: toSave, sha, title: state.doc.form.title },
      });
      setState((s) =>
        s
          ? {
              ...s,
              // Show the tidied text, unless more was typed while saving.
              doc: s.doc.form.body === state.doc.form.body ? { ...s.doc, form: { ...s.doc.form, body } } : s.doc,
              sha: res.sha,
              savedContent: toSave,
              notice: null,
              remote: undefined,
            }
          : s,
      );
      await putLocalDraft({ uid: me.user.id, type, id, content: toSave, baseSha: res.sha, savedContent: toSave });
      setConflict(false);
      setStatus("saved");
      setSavedAt(new Date());
    } catch (err) {
      setStatus("error");
      if (err instanceof ApiError && err.status === 409) setConflict(true);
      else if (err instanceof NetworkError) setMessage(t("editor.offline"));
      else setMessage(err instanceof ApiError ? err.message : t("error.generic"));
    }
  };

  const useRemote = async () => {
    if (!state) return;
    try {
      const remote = state.remote ?? (await api<{ content: string; sha: string }>(`/api/drafts/${type}/${id}`));
      const doc = parseDraft(remote.content, state.site) ?? state.doc;
      setState({ ...state, doc, sha: remote.sha, savedContent: remote.content, notice: null, remote: undefined });
      await deleteLocalDraft(me.user.id, type, id);
      setConflict(false);
      setStatus("idle");
    } catch {
      setMessage(t("error.generic"));
    }
  };

  // Cmd/Ctrl+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void save();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const [headingMenu, setHeadingMenu] = useState(false);
  const format = (action: "bold" | "italic" | "heading" | "link" | "list" | "quote") => {
    const ed = editorRef.current;
    if (!ed) return;
    if (action === "bold") ed.wrap("**", "**", t("editor.sampleText"));
    else if (action === "italic") ed.wrap("_", "_", t("editor.sampleText"));
    else if (action === "link") ed.wrap("[", "](https://)", t("editor.sampleText"));
    else if (action === "heading") setHeadingMenu(true);
    else if (action === "quote") ed.quote();
    else ed.prefix("- ");
  };

  /** Markdown mode edits the whole file; a valid file updates the form as you type. */
  const onMarkdownChange = (text: string) => {
    setMarkdownText(text);
    const doc = state ? parseDraft(text, state.site) : null;
    setMarkdownError(!doc);
    if (doc) setState((s) => (s ? { ...s, doc } : s));
  };

  const switchMode = (next: "rich" | "markdown") => {
    if (next === mode || !state) return;
    if (next === "markdown") {
      setMarkdownText(content);
      setMarkdownError(false);
    } else if (markdownError) {
      setMessage(t("editor.invalidFrontMatter"));
      return;
    }
    setMode(next);
  };

  const back = () => navigate({ name: "drafts" });

  if (loadError) {
    return (
      <div class="center-screen">
        <p class="secondary">{loadError}</p>
        <button type="button" class="btn btn-tinted" onClick={back}>
          {t("editor.backToDrafts")}
        </button>
      </div>
    );
  }
  if (!state) {
    return (
      <div class="center-screen" role="status">
        <span class="spinner" aria-hidden="true" />
        <span class="visually-hidden">{t("app.loading")}</span>
      </div>
    );
  }

  const f = state.doc.form;
  const statusText =
    status === "saving"
      ? t("editor.saving")
      : unsaved
        ? state.savedContent === null
          ? t("editor.notSavedYet")
          : t("editor.unsavedChanges")
        : savedAt
          ? t("editor.savedAt", { time: savedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) })
          : t("editor.savedOnGitHub");
  const categoryTitle = (slug: string) => state.site.categories.find((c) => c.slug === slug)?.title ?? slug;

  return (
    <div class="editor">
      <header class="nav-bar collapsed editor-bar">
        <div class="nav-leading">
          <button type="button" class="btn-plain" onClick={back}>
            <ChevronLeft size={22} aria-hidden="true" />
            {t("nav.drafts")}
          </button>
        </div>
        <div class="nav-inline-title editor-status" role="status" aria-live="polite">
          {unsaved && <span class="dot" aria-hidden="true" />}
          {statusText}
        </div>
        <div class="nav-trailing">
          <button type="button" class="btn btn-filled btn-small" onClick={() => void save()} disabled={status === "saving" || uploading || markdownError || !unsaved}>
            {t("editor.saveDraft")}
          </button>
        </div>
      </header>

      {conflict && (
        <div class="banner banner-error editor-banner" role="alert">
          <div>
            <p>{t("editor.conflict")}</p>
            <div class="banner-actions">
              <button type="button" class="btn btn-tinted btn-small" onClick={() => void useRemote()}>
                {t("editor.useGitHubVersion")}
              </button>
              <button type="button" class="btn btn-plain btn-small destructive" onClick={() => void save({ overwrite: true })}>
                {t("editor.keepMine")}
              </button>
            </div>
          </div>
        </div>
      )}
      {state.notice === "restored" && !conflict && <p class="banner banner-info editor-banner">{t("editor.restored")}</p>}
      {message && (
        <p class="banner banner-error editor-banner" role="alert">
          {message}
        </p>
      )}

      <div class="editor-body">
        <p class="eyebrow">{type === "post" ? t("editor.newPostLabel") : t("editor.newPageLabel")}</p>
        <textarea
          ref={titleRef}
          class="title-input"
          rows={1}
          placeholder={t("editor.titlePlaceholder")}
          value={f.title}
          onInput={(e) => onTitle((e.target as HTMLTextAreaElement).value.replace(/\n/g, " "))}
          aria-label={t("editor.title")}
        />

        {markdownError && mode === "markdown" && (
          <p class="banner banner-error editor-banner" role="alert">
            {t("editor.invalidFrontMatter")}
          </p>
        )}

        {mode === "rich" && (<>
        <button type="button" class="details-toggle" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(!detailsOpen)}>
          {t("editor.details")}
        </button>
        {detailsOpen && (
          <ul class="grouped-list form-list">
            <li class="row">
              <label class="row-label" for="f-date">
                {t("editor.date")}
              </label>
              <input
                id="f-date"
                type="datetime-local"
                class="row-input"
                value={toLocalInput(f.date)}
                onChange={(e) => {
                  const v = (e.target as HTMLInputElement).value;
                  const date = fromLocalInput(v);
                  if (date) setForm({ date });
                }}
              />
            </li>
            <li class="row">
              <label class="row-label" for="f-slug">
                {t("editor.slug")}
              </label>
              <input
                id="f-slug"
                class="row-input"
                value={f.slug}
                autocapitalize="off"
                spellcheck={false}
                onInput={(e) => setForm({ slug: slugify((e.target as HTMLInputElement).value) })}
              />
            </li>
            <li>
              <button type="button" class="row row-button-left" onClick={() => setCategoriesOpen(true)}>
                <span class="row-label">{t("editor.categories")}</span>
                <span class="row-value chips">
                  {f.categories.length ? f.categories.map((c) => <span class="chip">{categoryTitle(c)}</span>) : t("editor.none")}
                </span>
              </button>
            </li>
            <li class="row">
              <label class="row-label" for="f-tags">
                {t("editor.tags")}
              </label>
              <input
                id="f-tags"
                class="row-input"
                value={f.tags.join(", ")}
                placeholder={t("editor.tagsPlaceholder")}
                autocapitalize="off"
                onChange={(e) =>
                  setForm({
                    tags: (e.target as HTMLInputElement).value
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean),
                  })
                }
              />
            </li>
            <li>
              <button type="button" class="row row-button-left" onClick={openCover}>
                <span class="row-label">{t("editor.cover")}</span>
                {f.cover ? (
                  <img class="cover-thumb" src={f.cover} alt="" width={44} height={44} />
                ) : (
                  <span class="row-value">{t("editor.none")}</span>
                )}
              </button>
            </li>
          </ul>
        )}

        </>)}

        <div class="toolbar" role="toolbar" aria-label={t("editor.formatting")}>
          <button type="button" onClick={() => format("bold")} aria-label={t("editor.bold")}>
            <Bold size={20} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => format("italic")} aria-label={t("editor.italic")}>
            <Italic size={20} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => format("heading")} aria-label={t("editor.heading")}>
            <Heading2 size={20} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => format("link")} aria-label={t("editor.link")}>
            <Link size={20} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => format("list")} aria-label={t("editor.list")}>
            <List size={20} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => format("quote")} aria-label={t("editor.quote")}>
            <Quote size={20} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} aria-label={t("photos.add")}>
            <ImagePlus size={20} aria-hidden="true" />
          </button>
          <button type="button" onClick={openVideo} aria-label={t("editor.video")}>
            <TvMinimalPlay size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            class="toolbar-end"
            aria-pressed={mode === "markdown"}
            onClick={() => switchMode(mode === "rich" ? "markdown" : "rich")}
            aria-label={t("editor.editMarkdown")}
            title={t("editor.editMarkdown")}
          >
            <FileCode size={20} aria-hidden="true" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const input = e.target as HTMLInputElement;
              addPhotos([...(input.files ?? [])]);
              input.value = "";
            }}
          />
        </div>
        {uploads.length > 0 && (
          <ul class="upload-list" aria-live="polite">
            {uploads.map((u) => (
              <li class={`upload upload-${u.state}`}>
                <span class="upload-name">{u.name}</span>
                <span class="upload-state">
                  {u.state === "processing"
                    ? t("photos.processing")
                    : u.state === "uploading"
                      ? t("photos.uploading", { pct: String(Math.round(u.progress * 100)) })
                      : u.state === "done"
                        ? t("photos.done")
                        : u.error}
                </span>
                {u.state === "error" && (
                  <span class="upload-actions">
                    <button type="button" class="btn-plain" onClick={() => void runUpload(u)} aria-label={t("photos.retry")}>
                      <RotateCw size={18} aria-hidden="true" />
                    </button>
                    <button type="button" class="btn-plain destructive" onClick={() => removeUpload(u.token)} aria-label={t("photos.remove")}>
                      <X size={18} aria-hidden="true" />
                    </button>
                  </span>
                )}
                <progress class="upload-progress" max={1} value={u.state === "processing" ? undefined : u.progress} />
              </li>
            ))}
          </ul>
        )}
        <BodyEditor
          value={mode === "rich" ? f.body : markdownText}
          rich={mode === "rich"}
          site={state.site}
          onChange={(text) => (mode === "rich" ? setForm({ body: text }) : onMarkdownChange(text))}
          onReady={(ed) => (editorRef.current = ed)}
          onFiles={addPhotos}
        />
      </div>

      <ActionSheet
        open={headingMenu}
        onClose={() => setHeadingMenu(false)}
        title={t("editor.textStyle")}
        actions={[
          ...[2, 3, 4, 5].map((level) => ({ label: t("editor.headingLevel", { n: String(level) }), onSelect: () => editorRef.current?.heading(level) })),
          { label: t("editor.normalText"), onSelect: () => editorRef.current?.heading(0) },
        ]}
        cancelLabel={t("common.cancel")}
      />

      <Sheet open={coverOpen} onClose={() => setCoverOpen(false)} title={t("editor.cover")} doneLabel={t("account.done")}>
        {draftImages === null ? (
          <div class="empty-state" role="status">
            <span class="spinner" aria-hidden="true" />
          </div>
        ) : (
          <>
            {draftImages.length === 0 && <p class="secondary sheet-note">{t("editor.noDraftImages")}</p>}
            <div class="image-grid">
              <button
                type="button"
                class={`image-choice none${f.cover ? "" : " selected"}`}
                aria-pressed={!f.cover}
                onClick={() => {
                  setForm({ cover: "" });
                  setCoverOpen(false);
                }}
              >
                <ImageOff size={28} aria-hidden="true" />
                <span>{t("editor.noCover")}</span>
              </button>
              {draftImages.map((img) => (
                <button
                  type="button"
                  class={`image-choice${f.cover === img.url ? " selected" : ""}`}
                  aria-pressed={f.cover === img.url}
                  aria-label={img.file}
                  onClick={() => {
                    setForm({ cover: img.url });
                    setCoverOpen(false);
                  }}
                >
                  <img src={img.thumb} alt="" loading="lazy" />
                  {f.cover === img.url && <Check class="image-check" size={20} aria-hidden="true" />}
                </button>
              ))}
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={videoOpen} onClose={() => setVideoOpen(false)} title={t("editor.video")} doneLabel={t("common.cancel")}>
        <form
          class="video-form"
          onSubmit={(e) => {
            e.preventDefault();
            addVideo();
          }}
        >
          <label class="secondary" for="video-link">
            {t("editor.videoHint")}
          </label>
          <input
            id="video-link"
            type="url"
            inputMode="url"
            autocapitalize="off"
            autocomplete="off"
            spellcheck={false}
            placeholder="https://youtu.be/…"
            value={videoLink}
            aria-invalid={videoError}
            aria-describedby={videoError ? "video-error" : undefined}
            onInput={(e) => {
              setVideoLink((e.target as HTMLInputElement).value);
              setVideoError(false);
            }}
          />
          {videoError && (
            <p id="video-error" class="error" role="alert">
              {t("editor.videoInvalid")}
            </p>
          )}
          <button type="submit" class="btn btn-filled" disabled={!videoLink.trim()}>
            {t("editor.videoAdd")}
          </button>
        </form>
      </Sheet>

      <Sheet open={categoriesOpen} onClose={() => setCategoriesOpen(false)} title={t("editor.categories")} doneLabel={t("account.done")}>
        {state.site.categories.length === 0 ? (
          <p class="secondary sheet-note">{t("editor.noCategories")}</p>
        ) : (
          <ul class="grouped-list">
            {state.site.categories.map((c) => {
              const checked = f.categories.includes(c.slug);
              return (
                <li>
                  <label class="row row-check">
                    <span class="row-label">{c.title}</span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setForm({ categories: checked ? f.categories.filter((x) => x !== c.slug) : [...f.categories, c.slug] })
                      }
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>
    </div>
  );
}
