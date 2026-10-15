// SPDX-License-Identifier: MIT
//
// Editing a draft: title, details (front matter as a form) and the text.
// Typing autosaves on this device; "Save draft" commits to the site
// repository. If the draft changed on GitHub meanwhile, the user chooses
// which version to keep — nothing is overwritten silently.

import { Bold, Check, ChevronLeft, Heading2, ImageOff, Italic, Link, List, Quote } from "lucide-preact";
import { continueBlock } from "../lib/continue-block";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { slugify, zonedLocalToIso } from "../../shared/frontmatter";
import { api, ApiError, type Me, NetworkError } from "../lib/api";
import { type DraftDoc, type DraftForm, newDraft, parseDraft, serializeDraft } from "../lib/draft-model";
import { t, useLanguage } from "../lib/i18n";
import { deleteLocalDraft, getLocalDraft, putLocalDraft } from "../lib/local-drafts";
import { type DraftKind, navigate } from "../lib/router";
import { loadSite, type SiteSettings } from "../lib/site";
import { Sheet } from "./Sheet";

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

function wrap(el: HTMLTextAreaElement, before: string, after = before, placeholder = "") {
  const { selectionStart: s, selectionEnd: e, value } = el;
  const selected = value.slice(s, e) || placeholder;
  const next = value.slice(0, s) + before + selected + after + value.slice(e);
  return { next, cursor: [s + before.length, s + before.length + selected.length] as const };
}

function prefixLines(el: HTMLTextAreaElement, prefix: string) {
  const { selectionStart: s, selectionEnd: e, value } = el;
  const start = value.lastIndexOf("\n", s - 1) + 1;
  const lines = value.slice(start, e).split("\n").map((l) => (l.startsWith(prefix) ? l : prefix + l));
  const replaced = lines.join("\n");
  return { next: value.slice(0, start) + replaced + value.slice(e), cursor: [start, start + replaced.length] as const };
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
  const [draftImages, setDraftImages] = useState<{ file: string; url: string; thumb: string }[] | null>(null);

  const openCover = () => {
    setCoverOpen(true);
    setDraftImages(null);
    api<{ images: { file: string; url: string; thumb: string }[] }>(`/api/draft-media/${id}`).then(
      (r) => setDraftImages(r.images),
      () => setDraftImages([]),
    );
  };
  const textRef = useRef<HTMLTextAreaElement>(null);
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

  const onTitle = (title: string) => {
    const f = state!.doc.form;
    // The slug follows the title until it's edited by hand.
    const slugFollows = !f.slug || f.slug === slugify(f.title);
    setForm({ title, ...(slugFollows ? { slug: title.trim() ? slugify(title) : "" } : {}) });
  };

  const save = async (opts: { overwrite?: boolean } = {}) => {
    if (!state || status === "saving") return;
    if (!state.doc.form.title.trim()) {
      setMessage(t("editor.needTitle"));
      titleRef.current?.focus();
      return;
    }
    setStatus("saving");
    setMessage(null);
    let sha = state.sha;
    try {
      if (opts.overwrite) {
        sha = (await api<{ sha: string }>(`/api/drafts/${type}/${id}`)).sha;
      }
      const res = await api<{ sha: string }>(`/api/drafts/${type}/${id}`, {
        method: "PUT",
        body: { content, sha, title: state.doc.form.title },
      });
      setState((s) => (s ? { ...s, sha: res.sha, savedContent: content, notice: null, remote: undefined } : s));
      await putLocalDraft({ uid: me.user.id, type, id, content, baseSha: res.sha, savedContent: content });
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

  const format = (action: "bold" | "italic" | "heading" | "link" | "list" | "quote") => {
    const el = textRef.current;
    if (!el) return;
    const r =
      action === "bold"
        ? wrap(el, "**", "**", t("editor.sampleText"))
        : action === "italic"
          ? wrap(el, "_", "_", t("editor.sampleText"))
          : action === "link"
            ? wrap(el, "[", "](https://)", t("editor.sampleText"))
            : prefixLines(el, action === "heading" ? "## " : action === "list" ? "- " : "> ");
    setForm({ body: r.next });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.cursor[0], r.cursor[1]);
    });
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
          <button type="button" class="btn btn-filled btn-small" onClick={() => void save()} disabled={status === "saving" || !unsaved}>
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
                value={f.date.slice(0, 16)}
                onChange={(e) => {
                  const v = (e.target as HTMLInputElement).value;
                  if (v) setForm({ date: zonedLocalToIso(v, state.site.timezone) });
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
        </div>
        <textarea
          ref={textRef}
          class="body-input"
          placeholder={t("editor.bodyPlaceholder")}
          value={f.body}
          onInput={(e) => setForm({ body: (e.target as HTMLTextAreaElement).value })}
          onKeyDown={(e) => {
            const el = e.currentTarget;
            if (e.key !== "Enter" || e.shiftKey || e.isComposing || el.selectionStart !== el.selectionEnd) return;
            const r = continueBlock(el.value, el.selectionStart);
            if (!r) return;
            e.preventDefault();
            setForm({ body: r.text });
            requestAnimationFrame(() => el.setSelectionRange(r.cursor, r.cursor));
          }}
          aria-label={t("editor.text")}
        />
      </div>

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
