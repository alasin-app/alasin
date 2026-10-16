// SPDX-License-Identifier: MIT
// The Bin: deleted drafts, posts and pages, newest deletion first, each with
// what it was and who deleted it when. Recover puts it back where it was (or
// under a new name if something new is there); Delete permanently and Empty
// Bin remove files for good — the only way Alasin deletes from the repository.

import { useState } from "preact/hooks";
import { api, ApiError, type Me } from "../lib/api";
import type { ContentItem } from "../lib/content-index";
import { getLanguage, t, useLanguage } from "../lib/i18n";
import { useLastUpdated } from "../lib/last-updated";
import { navigate } from "../lib/router";
import { useContent } from "../lib/use-content";
import { ContentPlaceholder } from "./ContentList";
import { ActionSheet } from "./Sheet";

type Ask = { kind: "item"; item: ContentItem } | { kind: "purge"; items: ContentItem[] } | { kind: "rename"; item: ContentItem; taken: string };

export function BinList(props: { me: Me }) {
  useLanguage();
  const { site, content, error, refresh } = useContent(props.me);
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

  const purge = (list: ContentItem[]) =>
    run(async () => {
      for (let i = 0; i < list.length; i += 100) {
        await api("/api/bin/purge", { method: "POST", body: { items: list.slice(i, i + 100).map((x) => ({ path: x.path, sha: x.sha })) } });
      }
    });

  const was = (i: ContentItem) =>
    t(`bin.was.${i.origin?.state ?? "published"}.${i.kind}` as "bin.was.published.post");

  return (
    <>
      <div class="list-controls bin-controls">
        <p class="secondary list-note">{t("bin.intro")}</p>
        {items.length > 0 && (
          <button type="button" class="btn btn-small btn-plain destructive" disabled={busy} onClick={() => setAsk({ kind: "purge", items: [...items] })}>
            {t("bin.empty")}
          </button>
        )}
        {message && (
          <p class="banner banner-error editor-banner" role="alert">
            {message}
          </p>
        )}
      </div>
      {items.length === 0 ? (
        <div class="empty-state">
          <h2 class="headline">{t("bin.emptyTitle")}</h2>
          <p class="secondary">{t("bin.emptyBody")}</p>
        </div>
      ) : (
        <ul class="grouped-list">
          {items.map((item) => {
            const d = deleted.get(item.path);
            const when = d ? new Date(d.date).toLocaleDateString(getLanguage(), { day: "numeric", month: "short", year: "numeric" }) : "";
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

      <ActionSheet
        open={ask?.kind === "item"}
        onClose={() => setAsk(null)}
        title={ask?.kind === "item" ? ask.item.title : ""}
        actions={
          ask?.kind === "item"
            ? [
                { label: t("bin.recover"), onSelect: () => void recover(ask.item) },
                { label: t("bin.deleteForever"), destructive: true, onSelect: () => setAsk({ kind: "purge", items: [ask.item] }) },
              ]
            : []
        }
        cancelLabel={t("common.cancel")}
      />
      <ActionSheet
        open={ask?.kind === "purge"}
        onClose={() => setAsk(null)}
        title={ask?.kind === "purge" ? (ask.items.length === 1 ? t("bin.deleteForeverTitle", { title: ask.items[0]!.title }) : t("bin.emptyTitleConfirm", { n: String(ask.items.length) })) : ""}
        message={t("bin.cannotUndo")}
        actions={ask?.kind === "purge" ? [{ label: ask.items.length === 1 ? t("bin.deleteForever") : t("bin.empty"), destructive: true, onSelect: () => void purge(ask.items) }] : []}
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
