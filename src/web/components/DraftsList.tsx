// SPDX-License-Identifier: MIT
// Every draft: those in the drafts folder, posts and pages marked `draft: true`
// in the content folders (e.g. left over from an older blog), and what only
// this device has: drafts never saved to GitHub, drafts saved earlier but
// published or deleted elsewhere since, and unsaved changes to published
// posts. Newest first.

import { ChevronRight } from "lucide-preact";
import { useEffect, useState } from "preact/hooks";
import type { Me } from "../lib/api";
import { parseDraft } from "../lib/draft-model";
import { getLanguage, t, useLanguage } from "../lib/i18n";
import { type LocalDraft, listLocalDrafts } from "../lib/local-drafts";
import { hrefFor, linkHandler } from "../lib/router";
import { lockKey, useLocks } from "../lib/edit-lock";
import { useLastUpdated } from "../lib/last-updated";
import { useContent } from "../lib/use-content";
import { authorUser } from "../lib/authors";
import { ContentPlaceholder, ContentRow } from "./ContentList";

/**
 * `mine`: only the signed-in user's drafts (by the author field; all drafts if
 * the site has none) and what's on this device — for the home screen.
 */
export function DraftsList(props: { me: Me; mine?: boolean }) {
  useLanguage();
  const { site, content, error, refresh } = useContent(props.me);
  const [local, setLocal] = useState<LocalDraft[]>([]);
  const drafts = (content?.items ?? []).filter(
    (i) => i.state === "draft" && (!props.mine || !site?.authorField || authorUser(i, site)?.id === props.me.user.id),
  );
  // The home screen shows only who wrote each draft, not who changed it last.
  const updated = useLastUpdated(props.mine ? [] : drafts);
  const locks = useLocks();
  useEffect(() => {
    void listLocalDrafts(props.me.user.id).then(setLocal);
  }, []);

  if (!site || !content) return <ContentPlaceholder error={error} refresh={refresh} />;

  const saved = new Set(drafts.map((d) => d.draftId).filter(Boolean));
  // Drafts on this device only, or with changes not saved yet.
  const unsaved = new Set(local.filter((l) => l.content !== l.savedContent).map((l) => l.id));
  const onlyHere = local
    .filter((l) => !l.id.startsWith("file:") && !saved.has(l.id))
    .map((l) => ({ l, doc: parseDraft(l.content, site) }))
    .sort((a, b) => b.l.updatedAt - a.l.updatedAt);
  const time = (n: number) => (Number.isNaN(n) ? -Infinity : n);
  drafts.sort((a, b) => time(b.time) - time(a.time));

  // Unsaved changes to published posts and pages.
  const changedFiles = local.filter((l) => l.id.startsWith("file:") && l.content !== l.savedContent);

  if (!drafts.length && !onlyHere.length && !changedFiles.length) {
    // On the home screen, a short note, so what follows stays in view.
    if (props.mine) return <p class="secondary list-note">{t("home.noDraftsTitle")}</p>;
    return (
      <div class="empty-state">
        <h2 class="headline">{props.mine ? t("home.noDraftsTitle") : t("drafts.emptyTitle")}</h2>
        <p class="secondary">{props.mine ? t("home.noDraftsBody") : t("drafts.emptyBody")}</p>
      </div>
    );
  }
  return (
    <>
      {onlyHere.length > 0 && (
        <>
          <h3 class="list-section-header">{t("drafts.onThisDevice")}</h3>
          <ul class="grouped-list">
            {onlyHere.map(({ l, doc }) => {
              const route = { name: "editor" as const, type: l.type, id: l.id };
              const date = doc && !Number.isNaN(Date.parse(doc.form.date)) ? new Date(doc.form.date).toLocaleDateString(getLanguage()) : "";
              return (
                <li>
                  <a class="row row-link" href={hrefFor(route)} onClick={linkHandler(route)}>
                    <span class="row-label">
                      {doc?.form.title || <span class="secondary">{t("drafts.untitled")}</span>}
                      <span class="row-subtitle">
                        {[l.type === "post" ? t("drafts.post") : t("drafts.page"), date, l.baseSha ? t("drafts.goneElsewhere") : t("drafts.onlyHere")].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span class="badge badge-draft">{t("drafts.badge")}</span>
                    <ChevronRight class="chevron" size={18} aria-hidden="true" />
                  </a>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {changedFiles.length > 0 && (
        <>
          <h3 class="list-section-header">{t("drafts.unsavedEdits")}</h3>
          <ul class="grouped-list">
            {changedFiles.map((l) => {
              const path = l.id.slice("file:".length);
              const route = { name: "file" as const, path };
              const doc = parseDraft(l.content, site);
              return (
                <li>
                  <a class="row row-link" href={hrefFor(route)} onClick={linkHandler(route)}>
                    <span class="row-label">
                      {doc?.form.title || path.split("/").pop()}
                      <span class="row-subtitle">{[l.type === "post" ? t("drafts.post") : t("drafts.page"), t("drafts.unsaved")].join(" · ")}</span>
                    </span>
                    <ChevronRight class="chevron" size={18} aria-hidden="true" />
                  </a>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {drafts.length > 0 && (
        <ul class="grouped-list">
          {drafts.map((item) => (
            <ContentRow item={item} site={site} showKind note={item.draftId && unsaved.has(item.draftId) ? t("drafts.unsaved") : undefined} updated={updated.get(item.path)} editing={locks.get(lockKey(item))} />
          ))}
        </ul>
      )}
    </>
  );
}
