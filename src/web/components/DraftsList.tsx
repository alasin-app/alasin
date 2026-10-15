// SPDX-License-Identifier: MIT
// Drafts in the site repository, plus drafts on this device that were never
// saved to GitHub. Newest first.

import { ChevronRight } from "lucide-preact";
import { useEffect, useState } from "preact/hooks";
import { api, type Me } from "../lib/api";
import { parseDraft } from "../lib/draft-model";
import { t, useLanguage } from "../lib/i18n";
import { listLocalDrafts } from "../lib/local-drafts";
import { type DraftKind, hrefFor, linkHandler } from "../lib/router";
import { loadSite } from "../lib/site";

interface Row {
  type: DraftKind;
  id: string;
  title: string;
  date: string;
  local: "none" | "unsaved" | "only";
}

async function loadRows(me: Me): Promise<Row[]> {
  const [site, remote, local] = await Promise.all([
    loadSite(),
    api<{ drafts: { type: DraftKind; id: string }[] }>("/api/drafts"),
    listLocalDrafts(me.user.id),
  ]);
  const localByKey = new Map(local.map((l) => [`${l.type}:${l.id}`, l]));
  const rows: Row[] = [];
  // Read the remote drafts a few at a time for their titles.
  const queue = [...remote.drafts];
  const worker = async () => {
    for (let d = queue.shift(); d; d = queue.shift()) {
      const l = localByKey.get(`${d.type}:${d.id}`);
      localByKey.delete(`${d.type}:${d.id}`);
      let text = l?.content;
      if (!text) text = (await api<{ content: string }>(`/api/drafts/${d.type}/${d.id}`).catch(() => ({ content: "" }))).content;
      const doc = parseDraft(text, site);
      rows.push({
        type: d.type,
        id: d.id,
        title: doc?.form.title ?? "",
        date: doc?.form.date ?? "",
        local: l && l.content !== l.savedContent ? "unsaved" : "none",
      });
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  for (const l of localByKey.values()) {
    const doc = parseDraft(l.content, site);
    rows.push({ type: l.type, id: l.id, title: doc?.form.title ?? "", date: doc?.form.date ?? "", local: "only" });
  }
  return rows.sort((a, b) => b.id.localeCompare(a.id));
}

export function DraftsList(props: { me: Me }) {
  useLanguage();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    loadRows(props.me).then(setRows, () => setError(true));
  }, []);

  if (error) return <p class="empty-state secondary">{t("error.generic")}</p>;
  if (!rows) {
    return (
      <div class="empty-state" role="status">
        <span class="spinner" aria-hidden="true" />
        <span class="visually-hidden">{t("app.loading")}</span>
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div class="empty-state">
        <h2 class="headline">{t("drafts.emptyTitle")}</h2>
        <p class="secondary">{t("drafts.emptyBody")}</p>
      </div>
    );
  }
  return (
    <ul class="grouped-list">
      {rows.map((r) => {
        const route = { name: "editor" as const, type: r.type, id: r.id };
        return (
          <li>
            <a class="row row-link" href={hrefFor(route)} onClick={linkHandler(route)}>
              <span class="row-label">
                {r.title || <span class="secondary">{t("drafts.untitled")}</span>}
                <span class="row-subtitle">
                  {r.type === "post" ? t("drafts.post") : t("drafts.page")}
                  {r.date && !Number.isNaN(Date.parse(r.date)) ? ` · ${new Date(r.date).toLocaleDateString()}` : ""}
                  {r.local === "unsaved" ? ` · ${t("drafts.unsaved")}` : r.local === "only" ? ` · ${t("drafts.onlyHere")}` : ""}
                </span>
              </span>
              <span class="badge badge-draft">{t("drafts.badge")}</span>
              <ChevronRight class="chevron" size={18} aria-hidden="true" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
