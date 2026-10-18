// SPDX-License-Identifier: MIT
// The Bin: deleted drafts, posts and pages, newest deletion first, each with
// what it was and who deleted it when, and below them deleted photos. Recover
// puts one back where it was (a post or page under a new name if something new
// is there); Delete permanently and Empty Bin remove them for good — the only
// way Alasin deletes from the repository or deletes published photos.

import { useState } from "preact/hooks";
import { api, ApiError, type Me } from "../lib/api";
import type { ContentItem } from "../lib/content-index";
import { getLanguage, t, useLanguage } from "../lib/i18n";
import { useLastUpdated } from "../lib/last-updated";
import { binImageUrl, type BinImage, useMediaBin } from "../lib/media-bin";
import { navigate } from "../lib/router";
import { useContent } from "../lib/use-content";
import { ContentPlaceholder } from "./ContentList";
import { ActionSheet } from "./Sheet";

type Ask =
  | { kind: "item"; item: ContentItem }
  | { kind: "image"; image: BinImage }
  | { kind: "purge"; items: ContentItem[]; images: BinImage[] }
  | { kind: "rename"; item: ContentItem; taken: string };

const fileName = (key: string) => key.slice(key.lastIndexOf("/") + 1);
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(getLanguage(), { day: "numeric", month: "short", year: "numeric" });

/** Who deleted a photo when, "" if unknown. */
const deletedLine = (img: BinImage) => (img.deletedAt ? t("bin.deletedBy", { name: img.deletedBy, date: shortDate(img.deletedAt) }) : "");

export function BinList(props: { me: Me }) {
  useLanguage();
  const { site, content, error, refresh } = useContent(props.me);
  const photos = useMediaBin();
  const images = [...(photos.images ?? [])].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  const [ask, setAsk] = useState<Ask | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const items = content?.items.filter((i) => i.state === "bin") ?? [];
  // The last commit touching a Bin file is the one that deleted it.
  const deleted = useLastUpdated(items);

  if (!site || !content) return <ContentPlaceholder error={error} refresh={refresh} />;

  const time = (i: ContentItem) => Date.parse(deleted.get(i.path)?.date ?? "") || 0;
  items.sort((a, b) => time(b) - time(a));

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : t("error.generic"));
    } finally {
      setBusy(false);
      refresh();
      void photos.refresh();
    }
  };

  const recover = (item: ContentItem, rename = false) =>
    run(async () => {
      try {
        const res = await api<{ path: string; draftId?: string }>("/api/bin/recover", { method: "POST", body: { path: item.path, sha: item.sha, ...(rename ? { rename } : {}) } });
        if (res.draftId) navigate({ name: "editor", type: item.kind, id: res.draftId });
        else if (item.origin?.state === "published") navigate({ name: "file", path: res.path });
      } catch (err) {
        if (err instanceof ApiError && err.code === "exists" && !rename) setAsk({ kind: "rename", item, taken: item.origin?.path ?? "" });
        else throw err;
      }
    });

  const recoverImage = (image: BinImage) =>
    run(async () => {
      try {
        await api("/api/media-bin/recover", { method: "POST", body: { key: image.key } });
      } catch (err) {
        if (err instanceof ApiError && err.code === "exists") setMessage(t("bin.photoTaken", { key: image.key }));
        else throw err;
      }
    });

  const purge = (list: ContentItem[], imgs: BinImage[]) =>
    run(async () => {
      for (let i = 0; i < list.length; i += 100) {
        await api("/api/bin/purge", { method: "POST", body: { items: list.slice(i, i + 100).map((x) => ({ path: x.path, sha: x.sha })) } });
      }
      for (let i = 0; i < imgs.length; i += 100) {
        await api("/api/media-bin/purge", { method: "POST", body: { keys: imgs.slice(i, i + 100).map((x) => x.key) } });
      }
    });

  const purgeCount = ask?.kind === "purge" ? ask.items.length + ask.images.length : 0;
  const purgeTitle = (a: Extract<Ask, { kind: "purge" }>) =>
    purgeCount === 1 ? t("bin.deleteForeverTitle", { title: a.items[0]?.title ?? fileName(a.images[0]!.key) }) : t("bin.emptyTitleConfirm", { n: String(purgeCount) });

  const was = (i: ContentItem) =>
    t(`bin.was.${i.origin?.state ?? "published"}.${i.kind}` as "bin.was.published.post");

  return (
    <>
      <div class="list-controls bin-controls">
        <p class="secondary list-note">{t("bin.intro")}</p>
        {items.length + images.length > 0 && (
          <button type="button" class="btn btn-small btn-plain destructive" disabled={busy} onClick={() => setAsk({ kind: "purge", items: [...items], images })}>
            {t("bin.empty")}
          </button>
        )}
        {message && (
          <p class="banner banner-error editor-banner" role="alert">
            {message}
          </p>
        )}
      </div>
      {items.length === 0 && images.length === 0 ? (
        <div class="empty-state">
          <h2 class="headline">{t("bin.emptyTitle")}</h2>
          <p class="secondary">{t("bin.emptyBody")}</p>
        </div>
      ) : (
        <ul class="grouped-list">
          {items.map((item) => {
            const d = deleted.get(item.path);
            const when = d ? shortDate(d.date) : "";
            return (
              <li>
                <button type="button" class="row row-button-left" disabled={busy} onClick={() => setAsk({ kind: "item", item })}>
                  <span class="row-label">
                    {item.title}
                    <span class="row-subtitle">{[was(item), d ? t("bin.deletedBy", { name: d.name || d.login || "", date: when }) : ""].filter(Boolean).join(" · ")}</span>
                    <span class="row-subtitle">{item.origin?.path}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {images.length > 0 && (
        <section class="bin-photos">
          <h2 class="list-title">{t("bin.photos")}</h2>
          <div class="image-grid">
            {images.map((image) => (
              <button type="button" class="image-choice" disabled={busy} aria-label={fileName(image.key)} title={[fileName(image.key), deletedLine(image)].filter(Boolean).join(" · ")} onClick={() => setAsk({ kind: "image", image })}>
                <img src={binImageUrl(image.thumb)} alt="" loading="lazy" decoding="async" />
              </button>
            ))}
          </div>
        </section>
      )}
      {photos.failed && <p class="secondary list-note">{t("bin.photosFailed")}</p>}

      <ActionSheet
        open={ask?.kind === "item"}
        onClose={() => setAsk(null)}
        title={ask?.kind === "item" ? ask.item.title : ""}
        actions={
          ask?.kind === "item"
            ? [
                { label: t("bin.recover"), onSelect: () => void recover(ask.item) },
                { label: t("bin.deleteForever"), destructive: true, onSelect: () => setAsk({ kind: "purge", items: [ask.item], images: [] }) },
              ]
            : []
        }
        cancelLabel={t("common.cancel")}
      />
      <ActionSheet
        open={ask?.kind === "image"}
        onClose={() => setAsk(null)}
        title={ask?.kind === "image" ? fileName(ask.image.key) : ""}
        message={ask?.kind === "image" ? [t("bin.photoFrom", { key: ask.image.key }), deletedLine(ask.image)].filter(Boolean).join(" · ") : ""}
        actions={
          ask?.kind === "image"
            ? [
                { label: t("bin.recover"), onSelect: () => void recoverImage(ask.image) },
                { label: t("bin.deleteForever"), destructive: true, onSelect: () => setAsk({ kind: "purge", items: [], images: [ask.image] }) },
              ]
            : []
        }
        cancelLabel={t("common.cancel")}
      />
      <ActionSheet
        open={ask?.kind === "purge"}
        onClose={() => setAsk(null)}
        title={ask?.kind === "purge" ? purgeTitle(ask) : ""}
        message={ask?.kind === "purge" && ask.images.length ? t("bin.cannotUndoPhotos") : t("bin.cannotUndo")}
        actions={ask?.kind === "purge" ? [{ label: purgeCount === 1 ? t("bin.deleteForever") : t("bin.empty"), destructive: true, onSelect: () => void purge(ask.items, ask.images) }] : []}
        cancelLabel={t("common.cancel")}
      />
      <ActionSheet
        open={ask?.kind === "rename"}
        onClose={() => setAsk(null)}
        title={ask?.kind === "rename" ? t("bin.takenTitle") : ""}
        message={ask?.kind === "rename" ? t("bin.takenMessage", { path: ask.taken }) : ""}
        actions={ask?.kind === "rename" ? [{ label: t("bin.recoverRenamed"), onSelect: () => void recover(ask.item, true) }] : []}
        cancelLabel={t("common.cancel")}
      />
    </>
  );
}
