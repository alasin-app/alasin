// SPDX-License-Identifier: MIT
//
// Editing a draft or a published post or page: title, details (front matter
// as a form) and the text. Typing autosaves on this device; saving commits to
// the site repository. If the file changed on GitHub meanwhile, the user
// chooses which version to keep — nothing is overwritten silently.

import { Bold, Check, ChevronLeft, Ellipsis, FileCode, Heading2, ImageOff, ImagePlus, Italic, Link, List, Pencil, Quote, RotateCw, TvMinimalPlay, X } from "lucide-preact";
import { PhotoError, photosMarkdown, processPhoto, uploadPhoto } from "../lib/photos";
import type { ImageTarget, MarkdownEditor } from "../editor/markdown-editor";
import { BodyEditor } from "./BodyEditor";
import { useVisibleTop } from "../lib/visual-viewport";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { fromLocalInput, slugify, toLocalInput } from "../../shared/frontmatter";
import { youtubeId, youtubeShortcode } from "../../shared/youtube";
import { categoryTree } from "../../shared/categories";
import { api, ApiError, type Me, NetworkError } from "../lib/api";
import { authorKey, authorName } from "../lib/authors";
import { type DraftDoc, type DraftForm, newDraft, parseDraft, prepareSave, serializeDraft } from "../lib/draft-model";
import { getLanguage, t, useLanguage } from "../lib/i18n";
import { deleteLocalDraft, getLocalDraft, putLocalDraft } from "../lib/local-drafts";
import { type DraftKind, navigate } from "../lib/router";
import { ulid } from "../../shared/ulid";
import { mediaUsage, valueCounts } from "../lib/content-index";
import { useContent } from "../lib/use-content";
import { TagsInput } from "./TagsInput";
import { useEditLock } from "../lib/edit-lock";
import { loadSite, type SiteSettings } from "../lib/site";
import { MediaLibrary } from "./MediaLibrary";
import { ActionSheet, Sheet } from "./Sheet";

/** What is being edited: a draft, or a published post or page by its repository path. */
export type EditSource = { kind: "draft"; type: DraftKind; id: string } | { kind: "file"; path: string };

/** Where a draft went that this device saved earlier but is no longer in the drafts folder. */
interface Fate {
  state: "published" | "bin" | "deleted" | "unknown" | "draft";
  path?: string;
  exists?: boolean;
}

interface Loaded {
  site: SiteSettings;
  type: DraftKind;
  /** A draft saved from this device earlier was published or deleted elsewhere. */
  fate?: Fate;
  doc: DraftDoc;
  /** Blob SHA of the GitHub version the edits are based on (null: not on GitHub yet). */
  sha: string | null;
  /** Text last saved to GitHub. */
  savedContent: string | null;
  notice: "restored" | "conflict" | null;
  /** The GitHub version, when it differs from unsaved changes on this device. */
  remote?: { content: string; sha: string };
}

type Status = "idle" | "saving" | "saved" | "publishing" | "error";

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

/** Every post and page has an author: a GitHub login, or a name for someone without one. */
const hasAuthor = (f: DraftForm) => !!(f.authorId.trim() || f.author.trim());

/** The kind of a published file, from the configured folders. */
function kindOf(site: SiteSettings, path: string): DraftKind {
  return path.startsWith(`${site.folders.pages}/`) ? "page" : "post";
}

/** The key of this device's autosaved copy. */
const localIdOf = (source: EditSource) => (source.kind === "draft" ? source.id : `file:${source.path}`);

/** Where the file is read from and saved to. */
const fileUrl = (source: EditSource, type: DraftKind) =>
  source.kind === "draft" ? `/api/drafts/${type}/${source.id}` : `/api/content/file?path=${encodeURIComponent(source.path)}`;

async function load(me: Me, source: EditSource): Promise<Loaded> {
  const site = await loadSite();
  const type = source.kind === "draft" ? source.type : kindOf(site, source.path);
  const localId = localIdOf(source);
  let remote: { content: string; sha: string } | null = null;
  try {
    remote = await api<{ content: string; sha: string }>(fileUrl(source, type));
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 404)) throw err;
  }
  const local = await getLocalDraft(me.user.id, type, localId);
  const fromText = (text: string) => parseDraft(text, site) ?? newDraft(source.kind === "draft" ? source.id : ulid(), site);
  if (!remote && source.kind === "file") throw new ApiError(404, "not_found", t("editor.fileGone"));

  if (remote && local && local.content !== remote.content) {
    if (local.baseSha === remote.sha) {
      return { site, type, doc: fromText(local.content), sha: remote.sha, savedContent: remote.content, notice: "restored" };
    }
    return { site, type, doc: fromText(local.content), sha: local.baseSha, savedContent: local.savedContent, notice: "conflict", remote };
  }
  if (remote) return { site, type, doc: fromText(remote.content), sha: remote.sha, savedContent: remote.content, notice: null };
  if (local) {
    // Saved to GitHub from this device before, but gone now: find out where it went.
    let fate: Fate | undefined;
    if (local.baseSha !== null && source.kind === "draft") {
      fate = await api<Fate>(`/api/drafts/${type}/${source.id}/fate`).catch(() => undefined);
      if (fate && (fate.state === "unknown" || fate.state === "draft")) fate = undefined;
    }
    return { site, type, doc: fromText(local.content), sha: null, savedContent: null, notice: local.content ? "restored" : null, fate };
  }
  return { site, type, doc: newDraft(localId, site), sha: null, savedContent: null, notice: null };
}

/**
 * Draft photo addresses in `text` replaced by the published ones with the same
 * name in `published` (photo.jpg → /img/…/photo.jpg or photo-2.jpg), for
 * changes made to a draft that was meanwhile published elsewhere.
 */
function mapPublishedPhotos(text: string, published: string): string {
  const urls = [...published.matchAll(/\]\(([^)\s]+)/g)].map((m) => m[1]!);
  return text.replace(/\/api\/draft-media\/[0-9A-Z]{26}\/([a-z0-9_-]+)\.([a-z]+)/g, (whole, stem: string, ext: string) => {
    const match = urls.find((u) => new RegExp(`/${stem}(-\\d+)?\\.${ext}$`).test(u));
    return match ?? whole;
  });
}

export function Editor(props: { me: Me; source: EditSource }) {
  useLanguage();
  const { me, source } = props;
  const isDraft = source.kind === "draft";
  const localId = localIdOf(source);
  /** Photos are uploaded under the draft's ID, or for a published file under an ID for this editing session. */
  const uploadId = useMemo(() => (source.kind === "draft" ? source.id : ulid()), []);
  const [state, setState] = useState<Loaded | null>(null);
  const type: DraftKind = state?.type ?? (source.kind === "draft" ? source.type : "post");
  /** Bumped to read the file again (after taking over editing from someone else). */
  const [reload, setReload] = useState(0);
  // One editor at a time: read-only while someone else holds the lock.
  const lock = useEditLock(
    state && !state.fate ? (source.kind === "draft" ? `draft:${source.id}` : `file:${source.path}`) : null,
    state?.site.locks?.heartbeatSeconds ?? 60,
    // The lock came free: read the text again, as the other editor may have saved.
    () => setReload((n) => n + 1),
  );
  const readOnly = lock.state === "other" || lock.state === "lost";
  const [takeOverOpen, setTakeOverOpen] = useState(false);
  /** The menu of a published file, and the action waiting for confirmation. */
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirm, setConfirm] = useState<"unpublish" | "archive" | "delete" | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  /** The details form: "new" also asks for the title (a new draft opens with it). */
  const [detailsSheet, setDetailsSheet] = useState<"new" | "edit" | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  /** The author picker, and a name typed there that isn't in the list. */
  const [authorOpen, setAuthorOpen] = useState(false);
  const [otherAuthor, setOtherAuthor] = useState("");
  const [conflict, setConflict] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  /** Where the draft was published to, once it is. */
  const [published, setPublished] = useState<string | null>(null);
  const [videoLink, setVideoLink] = useState("");
  const [videoError, setVideoError] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoMenu, setPhotoMenu] = useState(false);
  /** The gallery or single image whose + opened the photo menu (null: the toolbar, photos go at the cursor). */
  const photoTarget = useRef<ImageTarget | null>(null);
  /** The picture whose text is being edited. */
  const [imageText, setImageText] = useState<{ target: ImageTarget; value: string } | null>(null);
  /** The media library sheet: the images picked, in the order picked. */
  const [library, setLibrary] = useState<string[] | null>(null);
  const editorRef = useRef<MarkdownEditor | null>(null);
  const [mode, setMode] = useState<"rich" | "markdown">("rich");
  /** The whole file as text while in Markdown mode. */
  const [markdownText, setMarkdownText] = useState("");
  const [markdownError, setMarkdownError] = useState(false);

  useVisibleTop();

  // The site's posts and pages (kept on the device, brought up to date in the
  // background): published ones to warn about addresses already in use, and
  // the tags in use to suggest while typing.
  const { content: siteContent } = useContent(me);
  const publishedItems = useMemo(() => siteContent?.items.filter((i) => i.state === "published") ?? [], [siteContent]);
  const mediaUsed = useMemo(() => (siteContent ? mediaUsage(siteContent) : null), [siteContent]);
  const knownTags = useMemo(() => valueCounts(siteContent?.items ?? [], (i) => i.tags), [siteContent]);
  // Everyone who has written (one entry per person, most posts first), then the users who haven't yet.
  const knownAuthors = useMemo(() => {
    const site = state?.site;
    if (!site) return [];
    const items = siteContent?.items ?? [];
    const out = new Map<string, { name: string; authorId: string }>();
    for (const { value: key } of valueCounts(items, (i) => authorKey(i, site))) {
      const i = items.find((x) => authorKey(x, site) === key)!;
      const user = site.users.find((u) => `@${u.login.toLowerCase()}` === key);
      out.set(key, { name: authorName(i, site), authorId: user?.login ?? i.authorId ?? "" });
    }
    for (const u of site.users) {
      const key = `@${u.login.toLowerCase()}`;
      if (!out.has(key)) out.set(key, { name: u.name || u.login, authorId: u.login });
    }
    return [...out].map(([key, a]) => ({ key, ...a }));
  }, [siteContent, state?.site]);

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

  useEffect(() => {
    if (imageText) document.getElementById("image-text")?.focus();
  }, [imageText !== null]);

  useEffect(() => {
    if (detailsSheet === "new") document.getElementById("d-title")?.focus();
  }, [detailsSheet]);

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
    // Photos uploaded here, and (for a published file) the photos already in its text.
    const inText = (): { file: string; url: string; thumb: string }[] => {
      if (isDraft || !state) return [];
      const { publicUrl, contentPrefix } = state.site.media;
      const seen = new Set<string>();
      return [...state.doc.form.body.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)]
        .map((m) => m[1]!)
        .filter((u) => u.startsWith(contentPrefix) && !seen.has(u) && seen.add(u))
        .map((u) => ({ file: u.split("/").pop()!, url: u, thumb: publicUrl + u.slice(contentPrefix.length) }));
    };
    api<{ images: { file: string; url: string; thumb: string }[] }>(`/api/draft-media/${uploadId}`).then(
      (r) => setDraftImages([...r.images, ...inText()]),
      () => setDraftImages(inText()),
    );
  };
  const titleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    load(me, source).then(
      (l) => {
        if (cancelled) return;
        setState(l);
        setConflict(l.notice === "conflict");
        // A new draft starts with its details; anything else untitled with the title.
        if (source.kind === "draft" && l.sha === null && !l.doc.form.title) setDetailsSheet("new");
        else if (!l.doc.form.title) setTimeout(() => titleRef.current?.focus(), 50);
      },
      (err: unknown) => !cancelled && setLoadError(err instanceof NetworkError ? t("error.network") : t("error.generic")),
    );
    return () => void (cancelled = true);
  }, [localId, reload]);

  const content = useMemo(() => (state ? serializeDraft(state.doc, state.site, { draft: isDraft }) : ""), [state]);
  const unsaved = state !== null && content !== state.savedContent;

  // Autosave on this device while typing.
  useEffect(() => {
    if (!state) return;
    // An untouched new draft isn't stored.
    const empty = state.savedContent === null && !state.doc.form.title.trim() && !state.doc.form.body.trim();
    if (empty) return;
    const timer = setTimeout(() => {
      void putLocalDraft({ uid: me.user.id, type, id: localId, content, baseSha: state.sha, savedContent: state.savedContent });
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
      const done = await uploadPhoto(uploadId, u.name, image, (p) => patchUpload(u.token, { progress: p }));
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

  const openPhotoMenu = (target: ImageTarget | null) => {
    photoTarget.current = target;
    setPhotoMenu(true);
  };

  /** Images added to the gallery or single image a + was tapped on, or else at the cursor. */
  const placePhotos = (urls: string[], target: ImageTarget | null) => {
    if (!state) return;
    if (target && editorRef.current?.addImages(target, urls.map((u) => `![](${u})`))) return;
    const md = photosMarkdown(urls, state.site.gallery);
    if (editorRef.current) editorRef.current.insertBlock(md);
    else updateForm((f) => ({ body: `${f.body.replace(/\s+$/, "")}\n\n${md}\n` }));
  };

  /** Published images reused as they are: no copy, the same address. */
  const addFromLibrary = (keys: string[]) => {
    setLibrary(null);
    const target = photoTarget.current;
    photoTarget.current = null;
    if (!state || !keys.length) return;
    placePhotos(
      keys.map((k) => state.site.media.contentPrefix + k),
      target,
    );
  };

  const removeUpload = (token: string) => {
    setUploads((list) => list.filter((x) => x.token !== token));
    updateForm((f) => ({ body: f.body.replace(new RegExp(`!\\[\\]\\(${placeholder(token)}\\)\\n*`), "") }));
  };

  const addPhotos = (files: File[], target: ImageTarget | null = null) => {
    if (!state || !files.length) return;
    const list: Upload[] = files.map((file) => ({
      token: Math.random().toString(36).slice(2, 10),
      file,
      name: file.name || "image.jpg",
      state: "processing",
      progress: 0,
    }));
    placePhotos(
      list.map((u) => placeholder(u.token)),
      target,
    );
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
    // A draft's slug follows the title until it's edited by hand. (A published
    // post's address never changes by itself.)
    const slugFollows = isDraft && (!f.slug || f.slug === slugify(f.title));
    setForm({ title, ...(slugFollows ? { slug: title.trim() ? slugify(title) : "" } : {}) });
  };

  /** Commits the draft; the new blob SHA, or null if it wasn't saved. */
  const save = async (opts: { overwrite?: boolean } = {}): Promise<string | null> => {
    if (!state || status === "saving" || status === "publishing" || readOnly) return null;
    if (uploading) {
      setMessage(t("photos.waitForUploads"));
      return null;
    }
    if (!state.doc.form.title.trim()) {
      setMessage(t("editor.needTitle"));
      titleRef.current?.focus();
      return null;
    }
    if (!hasAuthor(state.doc.form)) {
      setMessage(t("editor.needAuthor"));
      setDetailsSheet("edit");
      return null;
    }
    setStatus("saving");
    setMessage(null);
    const { content: toSave, body, author } = prepareSave(state.doc, state.site, { rich: mode === "rich", saved: state.savedContent, draft: isDraft });
    let sha = state.sha;
    try {
      if (opts.overwrite) {
        sha = (await api<{ sha: string }>(fileUrl(source, type))).sha;
      }
      let saved = toSave;
      if (source.kind === "draft") {
        const res = await api<{ sha: string }>(fileUrl(source, type), {
          method: "PUT",
          body: { content: toSave, sha, title: state.doc.form.title },
        });
        sha = res.sha;
      } else {
        // The address or date changed: the url field follows (if the site keeps one).
        const before = state.doc.raw ? (JSON.parse(state.doc.raw.formFields) as DraftForm) : null;
        const res = await api<{ sha: string; content: string; path: string }>("/api/content/file", {
          method: "PUT",
          body: {
            path: source.path,
            content: toSave,
            sha,
            day: toLocalInput(state.doc.form.date).slice(0, 10) || undefined,
            updateUrl: !!before && (before.slug !== state.doc.form.slug || before.date !== state.doc.form.date),
            editId: uploadId,
          },
        });
        // The Worker sets lastmod and turns new photos' addresses into public ones.
        sha = res.sha;
        saved = res.content;
        if (res.path !== source.path) {
          // Renamed to match the new address or date: continue editing it there.
          await deleteLocalDraft(me.user.id, type, localId);
          await putLocalDraft({ uid: me.user.id, type, id: `file:${res.path}`, content: saved, baseSha: sha, savedContent: saved });
          setStatus("saved");
          navigate({ name: "file", path: res.path }, { replace: true });
          return sha;
        }
      }
      setState((s) => {
        if (!s) return s;
        const typedMeanwhile = s.doc.form.body !== state.doc.form.body;
        const reread = saved !== toSave && !typedMeanwhile ? parseDraft(saved, s.site) : null;
        return {
          ...s,
          // Show the tidied (or saved) text, unless more was typed while saving.
          doc: reread ?? { ...s.doc, form: { ...s.doc.form, ...(typedMeanwhile ? {} : { body }), author } },
          sha,
          savedContent: saved,
          notice: null,
          remote: undefined,
        };
      });
      await putLocalDraft({ uid: me.user.id, type, id: localId, content: saved, baseSha: sha, savedContent: saved });
      setConflict(false);
      setStatus("saved");
      setSavedAt(new Date());
      return sha;
    } catch (err) {
      setStatus("error");
      if (err instanceof ApiError && err.status === 409 && err.code !== "exists") setConflict(true);
      else if (err instanceof NetworkError) setMessage(t("editor.offline"));
      else setMessage(err instanceof ApiError ? err.message : t("error.generic"));
      return null;
    }
  };

  /** Saves any changes, then publishes the saved version. */
  const publish = async () => {
    if (!state || source.kind !== "draft") return;
    const sha = unsaved || !state.sha ? await save() : state.sha;
    if (!sha) return;
    setStatus("publishing");
    setMessage(null);
    try {
      const res = await api<{ path: string }>(`/api/drafts/${type}/${source.id}/publish`, {
        method: "POST",
        // The post's day as the author sees it, for folders named by date.
        body: { sha, day: toLocalInput(state.doc.form.date).slice(0, 10) || undefined },
      });
      await deleteLocalDraft(me.user.id, type, localId);
      setPublished(res.path);
    } catch (err) {
      setStatus("error");
      if (err instanceof NetworkError) setMessage(t("editor.offline"));
      else setMessage(err instanceof ApiError ? err.message : t("error.generic"));
    }
  };

  const useRemote = async () => {
    if (!state) return;
    try {
      const remote = state.remote ?? (await api<{ content: string; sha: string }>(fileUrl(source, type)));
      const doc = parseDraft(remote.content, state.site) ?? state.doc;
      setState({ ...state, doc, sha: remote.sha, savedContent: remote.content, notice: null, remote: undefined });
      await deleteLocalDraft(me.user.id, type, localId);
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

  const back = () => navigate({ name: isDraft ? "drafts" : type === "page" ? "pages" : "posts" });

  /** A draft published elsewhere: carry this device's changes over to the published file. */
  const useMineInPublished = async (path: string) => {
    if (!state) return;
    try {
      const pub = await api<{ content: string; sha: string }>(`/api/content/file?path=${encodeURIComponent(path)}`);
      const doc = parseDraft(pub.content, state.site);
      if (!doc) throw new Error("unreadable");
      const form = { ...state.doc.form, body: mapPublishedPhotos(state.doc.form.body, pub.content), cover: mapPublishedPhotos(state.doc.form.cover, pub.content) };
      const content = serializeDraft({ ...doc, form }, state.site, { draft: false });
      await putLocalDraft({ uid: me.user.id, type, id: `file:${path}`, content, baseSha: pub.sha, savedContent: pub.content });
      await deleteLocalDraft(me.user.id, type, localId);
      navigate({ name: "file", path }, { replace: true });
    } catch {
      setMessage(t("error.generic"));
    }
  };

  /** Moves a published file: unpublish (to a draft) or archive. */
  const lifecycle = async (action: "unpublish" | "archive") => {
    if (!state || source.kind !== "file" || !state.sha) return;
    if (unsaved) {
      setMessage(t("editor.saveFirst"));
      return;
    }
    setStatus("saving");
    setMessage(null);
    try {
      const res = await api<{ path: string; draftId?: string }>("/api/lifecycle", {
        method: "POST",
        body: { action, path: source.path, sha: state.sha, lockId: lock.lockId, day: toLocalInput(state.doc.form.date).slice(0, 10) || undefined },
      });
      await deleteLocalDraft(me.user.id, type, localId);
      setStatus("saved");
      if (action === "unpublish" && res.draftId) navigate({ name: "editor", type, id: res.draftId }, { replace: true });
      else back();
    } catch (err) {
      setStatus("error");
      if (err instanceof ApiError && err.code === "conflict") setConflict(true);
      else if (err instanceof NetworkError) setMessage(t("editor.offline"));
      else setMessage(err instanceof ApiError ? err.message : t("error.generic"));
    }
  };

  /** Moves the draft, post or page to the Bin (a draft never saved is only discarded on this device). */
  const moveToBin = async () => {
    if (!state) return;
    if (state.sha === null) {
      await discardMine();
      return;
    }
    setStatus("saving");
    setMessage(null);
    try {
      const path = source.kind === "draft" ? `${state.site.folders.drafts}/${type}s/${source.id}.md` : source.path;
      await api("/api/bin/delete", { method: "POST", body: { path, sha: state.sha, lockId: lock.lockId } });
      await deleteLocalDraft(me.user.id, type, localId);
      setStatus("saved");
      back();
    } catch (err) {
      setStatus("error");
      if (err instanceof ApiError && err.code === "conflict") setConflict(true);
      else if (err instanceof NetworkError) setMessage(t("editor.offline"));
      else setMessage(err instanceof ApiError ? err.message : t("error.generic"));
    }
  };

  /** Takes the lock from whoever has it; the text is read again, as they may have saved meanwhile. */
  const takeOver = async () => {
    const wasOther = lock.state === "other";
    await lock.takeOver();
    if (wasOther) setReload((n) => n + 1);
  };

  const discardMine = async () => {
    await deleteLocalDraft(me.user.id, type, localId);
    back();
  };

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
  if (published) {
    return (
      <div class="center-screen" role="status">
        <Check class="published-check" size={44} aria-hidden="true" />
        <h2 class="headline">{t("editor.published")}</h2>
        <p class="secondary">{t("editor.publishedBody", { path: published })}</p>
        <button type="button" class="btn btn-tinted" onClick={back}>
          {t("editor.backToDrafts")}
        </button>
      </div>
    );
  }
  if (state?.fate) {
    const { fate } = state;
    const title = state.doc.form.title.trim() || t("drafts.untitled");
    return (
      <div class="center-screen fate-screen">
        <h2 class="headline">{fate.state === "published" ? t("editor.publishedElsewhere", { title }) : t("editor.deletedElsewhere", { title })}</h2>
        <p class="secondary">{t("editor.elsewhereBody")}</p>
        {message && (
          <p class="banner banner-error" role="alert">
            {message}
          </p>
        )}
        <div class="button-column">
          {fate.state === "published" && fate.path && fate.exists && (
            <button type="button" class="btn btn-filled" onClick={() => void useMineInPublished(fate.path!)}>
              {t("editor.useMineInPublished")}
            </button>
          )}
          {fate.state !== "published" && (
            <button type="button" class="btn btn-tinted" onClick={() => setState({ ...state, fate: undefined })}>
              {t("editor.keepAsNewDraft")}
            </button>
          )}
          <button type="button" class="btn btn-plain destructive" onClick={() => void discardMine()}>
            {t("editor.discardMine")}
          </button>
        </div>
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
    status === "publishing"
      ? t("editor.publishing")
      : status === "saving"
      ? t("editor.saving")
      : unsaved
        ? state.savedContent === null
          ? t("editor.notSavedYet")
          : t("editor.unsavedChanges")
        : savedAt
          ? t("editor.savedAt", { time: savedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) })
          : t("editor.savedOnGitHub");
  // A draft whose address a published post or page already has: publishing it would fail.
  const sameAddress = isDraft && f.slug ? publishedItems.find((i) => i.kind === type && i.slug === f.slug) : undefined;
  /** A draft that exists only on this device: deleting it discards it. */
  const neverSaved = state.sha === null;
  const categories = categoryTree(state.site.categories);
  const categoryNode = (slug: string) => categories.find((c) => c.slug === slug);
  // Published images are referred to by the site's own prefix (e.g. /img/…).
  const { contentPrefix, publicUrl } = state.site.media;
  const coverSrc = contentPrefix.startsWith("/") && f.cover.startsWith(contentPrefix) ? publicUrl + f.cover.slice(contentPrefix.length) : f.cover;
  const dateText = Number.isNaN(Date.parse(f.date))
    ? ""
    : new Date(f.date).toLocaleString(getLanguage(), { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div class="editor">
      <header class="nav-bar collapsed editor-bar">
        <div class="nav-leading">
          <button type="button" class="btn-plain" onClick={back}>
            <ChevronLeft size={22} aria-hidden="true" />
            {isDraft ? t("nav.drafts") : type === "page" ? t("nav.pages") : t("nav.posts")}
          </button>
        </div>
        <div class="nav-inline-title editor-status" role="status" aria-live="polite">
          {unsaved && <span class="dot" aria-hidden="true" />}
          {statusText}
        </div>
        <div class="nav-trailing">
          <button
            type="button"
            class="btn btn-tinted btn-small"
            onClick={() => void save()}
            disabled={status === "saving" || status === "publishing" || uploading || markdownError || !unsaved || readOnly}
          >
            {isDraft ? t("editor.saveDraft") : t("editor.save")}
          </button>
          {isDraft && (
          <button
            type="button"
            class="btn btn-filled btn-small"
            onClick={() => {
              if (!f.title.trim()) {
                setMessage(t("editor.needTitlePublish"));
                titleRef.current?.focus();
              } else if (!hasAuthor(f)) {
                setMessage(t("editor.needAuthor"));
                setDetailsSheet("edit");
              } else setPublishOpen(true);
            }}
            disabled={status === "saving" || status === "publishing" || uploading || markdownError || conflict || readOnly}
          >
            {t("editor.publish")}
          </button>
          )}
          <button type="button" class="btn-plain icon-button" onClick={() => setMenuOpen(true)} disabled={status === "saving" || status === "publishing" || readOnly} aria-label={t("editor.more")} title={t("editor.more")}>
            <Ellipsis size={22} aria-hidden="true" />
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
      {(lock.state === "other" || lock.state === "lost") && (
        <div class="banner banner-info editor-banner lock-banner" role="status">
          <img class="avatar-tiny" src={`/api/avatar/${lock.holder.uid}?s=40`} alt="" width={20} height={20} />
          <div>
            <p>
              {lock.state === "other"
                ? t("editor.lockedBy", { name: lock.holder.name ?? lock.holder.login })
                : t("editor.lockTaken", { name: lock.holder.name ?? lock.holder.login })}
            </p>
            <div class="banner-actions">
              <button type="button" class="btn btn-tinted btn-small" onClick={() => setTakeOverOpen(true)}>
                {t("editor.takeOver")}
              </button>
            </div>
          </div>
        </div>
      )}
      {sameAddress && (
        <div class="banner banner-error editor-banner" role="alert">
          <div>
            <p>{t(state.savedContent === null ? "editor.onlyHereSameAddress" : "editor.sameAddress", { title: sameAddress.title })}</p>
            <div class="banner-actions">
              <button type="button" class="btn btn-tinted btn-small" onClick={() => navigate({ name: "file", path: sameAddress.path })}>
                {t("editor.openPublished")}
              </button>
              {state.savedContent === null && (
                <button type="button" class="btn btn-plain btn-small destructive" onClick={() => void discardMine()}>
                  {t("editor.discardCopy")}
                </button>
              )}
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
        <p class="eyebrow">
          {isDraft ? (type === "post" ? t("editor.newPostLabel") : t("editor.newPageLabel")) : type === "post" ? t("editor.publishedPostLabel") : t("editor.publishedPageLabel")}
        </p>
        <div class="title-wrap">
          <textarea
            ref={titleRef}
            class="title-input"
            rows={1}
            readOnly={readOnly}
            placeholder={t("editor.titlePlaceholder")}
            value={f.title}
            onInput={(e) => onTitle((e.target as HTMLTextAreaElement).value.replace(/\n/g, " "))}
            aria-label={t("editor.title")}
          />
          {/* A hint that the title can be edited; the field itself is in the tab order. */}
          {!readOnly && (
            <button type="button" class="title-edit" tabIndex={-1} aria-hidden="true" title={t("editor.editTitle")} onClick={() => titleRef.current?.focus()}>
              <Pencil size={20} />
            </button>
          )}
        </div>

        {markdownError && mode === "markdown" && (
          <p class="banner banner-error editor-banner" role="alert">
            {t("editor.invalidFrontMatter")}
          </p>
        )}

        {mode === "rich" && (
        <div class="details-summary">
          {f.cover && <img class="cover-thumb" src={coverSrc} alt="" width={44} height={44} />}
          <div class="details-text">
            <p class="details-line">{[dateText, authorName(f, state.site), f.slug].filter(Boolean).join(" · ")}</p>
            {(f.categories.length > 0 || f.tags.length > 0) && (
              <p class="chips details-chips">
                {f.categories.map((c) => (
                  <span class="chip" title={categoryNode(c)?.path.join(" › ")}>
                    {categoryNode(c)?.title ?? c}
                  </span>
                ))}
                {f.tags.map((tag) => (
                  <span class="chip chip-tag">{tag}</span>
                ))}
              </p>
            )}
          </div>
          <button type="button" class="btn btn-tinted btn-small" onClick={() => setDetailsSheet("edit")} disabled={readOnly} aria-label={t("editor.editDetails")}>
            {t("editor.edit")}
          </button>
        </div>
        )}

        <div class={`toolbar${readOnly ? " is-disabled" : ""}`} role="toolbar" aria-label={t("editor.formatting")} {...(readOnly ? { inert: true } : {})}>
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
          <button type="button" onClick={() => openPhotoMenu(null)} aria-label={t("photos.add")}>
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
              addPhotos([...(input.files ?? [])], photoTarget.current);
              photoTarget.current = null;
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
          readOnly={readOnly}
          site={state.site}
          onChange={(text) => (mode === "rich" ? setForm({ body: text }) : onMarkdownChange(text))}
          onReady={(ed) => (editorRef.current = ed)}
          onFiles={(files) => addPhotos(files)}
          onAddPhotos={(target) => !readOnly && openPhotoMenu(target)}
          onImageText={(target, title) => !readOnly && setImageText({ target, value: title })}
        />
      </div>

      <ActionSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        actions={[
          ...(!isDraft
            ? [
                { label: t("editor.unpublish"), onSelect: () => setConfirm("unpublish") },
                { label: t("editor.archive"), onSelect: () => setConfirm("archive") },
              ]
            : []),
          // A draft never saved to GitHub is only discarded on this device.
          { label: neverSaved ? t("editor.discard") : t("editor.delete"), destructive: true, onSelect: () => setConfirm("delete") },
        ]}
        cancelLabel={t("common.cancel")}
      />
      <ActionSheet
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={
          confirm === "delete" && neverSaved
            ? t("editor.discardTitle", { title: f.title.trim() || t("drafts.untitled") })
            : confirm
              ? t(`editor.${confirm}Title`, { title: f.title.trim() })
              : ""
        }
        message={
          confirm === "delete" && neverSaved
            ? t("editor.deleteMessageLocal")
            : confirm
              ? t(`editor.${confirm}Message`)
              : ""
        }
        actions={
          confirm
            ? [{ label: confirm === "delete" && neverSaved ? t("editor.discard") : t(`editor.${confirm}`), destructive: true, onSelect: () => void (confirm === "delete" ? moveToBin() : lifecycle(confirm)) }]
            : []
        }
        cancelLabel={t("common.cancel")}
      />

      <ActionSheet
        open={takeOverOpen}
        onClose={() => setTakeOverOpen(false)}
        title={lock.state === "other" || lock.state === "lost" ? t("editor.takeOverTitle", { name: lock.holder.name ?? lock.holder.login }) : ""}
        message={t("editor.takeOverMessage")}
        actions={[{ label: t("editor.takeOver"), destructive: true, onSelect: () => void takeOver() }]}
        cancelLabel={t("common.cancel")}
      />

      <ActionSheet
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title={t("editor.publishTitle", { title: f.title.trim() })}
        message={t(type === "post" ? "editor.publishMessagePost" : "editor.publishMessagePage")}
        actions={[{ label: t("editor.publish"), onSelect: () => void publish() }]}
        cancelLabel={t("common.cancel")}
      />

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

      <ActionSheet
        open={photoMenu}
        onClose={() => setPhotoMenu(false)}
        title={t("photos.add")}
        actions={[
          { label: t("photos.fromDevice"), onSelect: () => fileRef.current?.click() },
          { label: t("photos.fromLibrary"), onSelect: () => setLibrary([]) },
        ]}
        cancelLabel={t("common.cancel")}
      />

      <Sheet
        open={detailsSheet !== null}
        onClose={() => setDetailsSheet(null)}
        title={detailsSheet === "new" ? t(type === "post" ? "home.newPost" : "home.newPage") : t("editor.details")}
        doneLabel={t("account.done")}
      >
        <fieldset class="form-fieldset" disabled={readOnly}>
          <ul class="grouped-list form-list">
            {detailsSheet === "new" && (
              <li class="row">
                <label class="row-label" for="d-title">
                  {t("editor.title")}
                </label>
                <input
                  id="d-title"
                  class="row-input"
                  value={f.title}
                  autocapitalize="sentences"
                  enterkeyhint="next"
                  onInput={(e) => onTitle((e.target as HTMLInputElement).value)}
                />
              </li>
            )}
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
                  {f.categories.length
                    ? f.categories.map((c) => (
                        <span class="chip" title={categoryNode(c)?.path.join(" › ")}>
                          {categoryNode(c)?.title ?? c}
                        </span>
                      ))
                    : t("editor.none")}
                </span>
              </button>
            </li>
            <li>
              <button
                type="button"
                class="row row-button-left"
                onClick={() => {
                  setOtherAuthor("");
                  setAuthorOpen(true);
                }}
              >
                <span class="row-label">{t("editor.author")}</span>
                <span class="row-value">{authorName(f, state.site) || t("editor.none")}</span>
              </button>
            </li>
            <li class="row">
              <label class="row-label" for="f-tags">
                {t("editor.tags")}
              </label>
              <TagsInput id="f-tags" value={f.tags} known={knownTags} onChange={(tags) => setForm({ tags })} />
            </li>
            <li>
              <button type="button" class="row row-button-left" onClick={openCover}>
                <span class="row-label">{t("editor.cover")}</span>
                {f.cover ? <img class="cover-thumb" src={coverSrc} alt="" width={44} height={44} /> : <span class="row-value">{t("editor.none")}</span>}
              </button>
            </li>
          </ul>
        </fieldset>
      </Sheet>

      <Sheet open={imageText !== null} onClose={() => setImageText(null)} title={t("editor.imageText")} doneLabel={t("common.cancel")}>
        <form
          class="video-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (imageText) editorRef.current?.setImageTitle(imageText.target, imageText.value);
            setImageText(null);
          }}
        >
          <label class="secondary" for="image-text">
            {t("editor.imageTextHint")}
          </label>
          <input
            id="image-text"
            type="text"
            autocapitalize="sentences"
            enterkeyhint="done"
            value={imageText?.value ?? ""}
            onInput={(e) => {
              const value = (e.target as HTMLInputElement).value;
              setImageText((it) => (it ? { ...it, value } : it));
            }}
          />
          <button type="submit" class="btn btn-filled">
            {t("account.done")}
          </button>
        </form>
      </Sheet>

      <Sheet open={library !== null} onClose={() => setLibrary(null)} title={t("nav.media")} doneLabel={t("common.cancel")}>
        <MediaLibrary
          site={state.site}
          used={mediaUsed}
          selected={library ?? []}
          onToggle={(key) => setLibrary((l) => (l?.includes(key) ? l.filter((k) => k !== key) : [...(l ?? []), key]))}
        />
        <div class="sheet-actions">
          <button type="button" class="btn btn-filled" disabled={!library?.length} onClick={() => addFromLibrary(library ?? [])}>
            {library && library.length > 1 ? t("photos.addCount", { n: String(library.length) }) : t("photos.addOne")}
          </button>
        </div>
      </Sheet>

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

      <Sheet open={authorOpen} onClose={() => setAuthorOpen(false)} title={t("editor.author")} doneLabel={t("common.cancel")}>
        <ul class="grouped-list">
          {(() => {
            // The current author first if nobody else has written as them.
            const current = authorKey(f, state.site);
            const list = current && !knownAuthors.some((a) => a.key === current) ? [{ key: current, name: authorName(f, state.site), authorId: f.authorId }, ...knownAuthors] : knownAuthors;
            return list.map((a) => (
              <li>
                <button
                  type="button"
                  class="row row-button-left"
                  aria-pressed={a.key === current}
                  onClick={() => {
                    setForm({ author: a.name, authorId: a.authorId });
                    setAuthorOpen(false);
                  }}
                >
                  <span class="row-label">
                    {a.name}
                    {a.authorId && <span class="row-subtitle">@{a.authorId}</span>}
                  </span>
                  {a.key === current && <Check class="row-checkmark" size={20} aria-hidden="true" />}
                </button>
              </li>
            ));
          })()}
        </ul>
        <form
          class="video-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!otherAuthor.trim()) return;
            // Someone without a GitHub login here: the name only.
            setForm({ author: otherAuthor.trim(), authorId: "" });
            setAuthorOpen(false);
          }}
        >
          <label class="secondary" for="other-author">
            {t("editor.otherAuthor")}
          </label>
          <input
            id="other-author"
            type="text"
            autocapitalize="words"
            autocomplete="off"
            enterkeyhint="done"
            value={otherAuthor}
            onInput={(e) => setOtherAuthor((e.target as HTMLInputElement).value)}
          />
          <button type="submit" class="btn btn-filled" disabled={!otherAuthor.trim()}>
            {t("account.done")}
          </button>
        </form>
      </Sheet>

      <Sheet open={categoriesOpen} onClose={() => setCategoriesOpen(false)} title={t("editor.categories")} doneLabel={t("account.done")}>
        {state.site.categories.length === 0 ? (
          <p class="secondary sheet-note">{t("editor.noCategories")}</p>
        ) : (
          <ul class="grouped-list">
            {categories.map((c) => {
              const checked = f.categories.includes(c.slug);
              return (
                <li>
                  {/* Nested categories are indented under their parent. */}
                  <label class="row row-check" style={{ "--depth": c.depth }}>
                    <span class="row-label" title={c.path.join(" › ")}>
                      {c.title}
                    </span>
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
