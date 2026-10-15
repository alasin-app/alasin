// SPDX-License-Identifier: MIT
// Every draft: those in the drafts folder, posts and pages marked `draft: true`
// in the content folders (e.g. left over from an older blog), and drafts on
// this device that were never saved to GitHub. Newest first.

import { ChevronRight } from "lucide-preact";
import { useEffect, useState } from "preact/hooks";
import type { Me } from "../lib/api";
import { parseDraft } from "../lib/draft-model";
import { getLanguage, t, useLanguage } from "../lib/i18n";
import { type LocalDraft, listLocalDrafts } from "../lib/local-drafts";
import { hrefFor, linkHandler } from "../lib/router";
import { useContent } from "../lib/use-content";
import { ContentPlaceholder, ContentRow } from "./ContentList";

export function DraftsList(props: { me: Me }) {
  useLanguage();
  const { site, content, error, refresh } = useContent(props.me);
  const [local, setLocal] = useState<LocalDraft[]>([]);
  useEffect(() => {
    void listLocalDrafts(props.me.user.id).then(setLocal);
  }, []);

  if (!site || !content) return <ContentPlaceholder error={error} refresh={refresh} />;

  const drafts = content.items.filter((i) => i.state === "draft");
  const saved = new Set(drafts.map((d) => d.draftId).filter(Boolean));
  // Drafts on this device only, or with changes not saved yet.
  const unsaved = new Set(local.filter((l) => l.content !== l.savedContent).map((l) => l.id));
  const onlyHere = local
    .filter((l) => !saved.has(l.id))
    .map((l) => ({ l, doc: parseDraft(l.content, site) }))
    .sort((a, b) => b.l.updatedAt - a.l.updatedAt);
  const time = (n: number) => (Number.isNaN(n) ? -Infinity : n);
  drafts.sort((a, b) => time(b.time) - time(a.time));

  if (!drafts.length && !onlyHere.length) {
    return (
      <div class="empty-state">
        <h2 class="headline">{t("drafts.emptyTitle")}</h2>
        <p class="secondary">{t("drafts.emptyBody")}</p>
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
                      <span class="row-subtitle">{[l.type === "post" ? t("drafts.post") : t("drafts.page"), date, t("drafts.onlyHere")].filter(Boolean).join(" · ")}</span>
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
      {drafts.length > 0 && (
        <ul class="grouped-list">
          {drafts.map((item) => (
            <ContentRow item={item} site={site} showKind note={item.draftId && unsaved.has(item.draftId) ? t("drafts.unsaved") : undefined} />
          ))}
        </ul>
      )}
    </>
  );
}
