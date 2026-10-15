// SPDX-License-Identifier: MIT
// The Posts and Pages sections: everything in the site repository of one kind,
// with as-you-type search, a state filter and a category filter. Posts are
// grouped by year and month (newest first), pages listed by title. Archived
// items show only under their filter, items in the Bin not at all.

import { ChevronDown, ChevronRight, RotateCw, Search as SearchIcon, X } from "lucide-preact";
import { useMemo, useState } from "preact/hooks";
import { categoryTree, withDescendants } from "../../shared/categories";
import type { Me } from "../lib/api";
import type { ContentItem, ItemKind } from "../lib/content-index";
import { getLanguage, t, useLanguage } from "../lib/i18n";
import { hrefFor, linkHandler, type Route } from "../lib/router";
import { createSearch, snippet } from "../lib/search";
import type { SiteSettings } from "../lib/site";
import { type LastUpdate, useLastUpdated } from "../lib/last-updated";
import { useContent } from "../lib/use-content";
import { Sheet } from "./Sheet";

type Filter = "all" | "draft" | "archived";

/** Where a row leads; null while it can't be opened yet. */
export function routeFor(item: ContentItem): Route | null {
  if (item.state === "draft" && item.draftId && item.path.endsWith(`/${item.draftId}.md`)) {
    return { name: "editor", type: item.kind, id: item.draftId };
  }
  return null;
}

function Highlighted(props: { text: string; query: string }) {
  const parts = snippet(props.text, props.query);
  if (!parts) return null;
  return <span class="row-snippet">{parts.map((p) => (p.match ? <mark>{p.text}</mark> : p.text))}</span>;
}

/** The allowed user an author field value means (their login, author value or an alias). */
export function authorUser(value: string, site: SiteSettings): SiteSettings["users"][number] | undefined {
  const v = value.toLowerCase();
  return v ? site.users.find((u) => u.names.some((n) => n.toLowerCase() === v)) : undefined;
}

function Byline(props: { item: ContentItem; site: SiteSettings; updated?: LastUpdate }) {
  const { item, updated } = props;
  const user = authorUser(item.author, props.site);
  const by = updated ? (updated.login ?? updated.name) : "";
  const when = updated ? new Date(updated.date).toLocaleDateString(getLanguage(), { day: "numeric", month: "short", year: "numeric" }) : "";
  if (!item.author && !updated) return null;
  return (
    <span class="row-byline">
      {user && <img class="avatar-tiny" src={`/api/avatar/${user.id}?s=40`} alt="" width={16} height={16} />}
      {item.author && <span>{item.author}</span>}
      {updated && <span class="secondary">{t("content.updatedBy", { name: by, date: when })}</span>}
    </span>
  );
}

export function ContentRow(props: { item: ContentItem; site: SiteSettings; query?: string; showKind?: boolean; note?: string; updated?: LastUpdate }) {
  const { item } = props;
  const route = routeFor(item);
  const title = (slug: string) => props.site.categories.find((c) => c.slug === slug)?.title ?? slug;
  const date = Number.isNaN(item.time) ? "" : new Date(item.time).toLocaleDateString(getLanguage(), { day: "numeric", month: "short", year: "numeric" });
  const kind = props.showKind ? (item.kind === "post" ? t("drafts.post") : t("drafts.page")) : "";
  const inner = (
    <>
      <span class="row-label">
        {item.title}
        <span class="row-subtitle">{[kind, date, ...item.categories.map(title), props.note].filter(Boolean).join(" · ")}</span>
        <Byline item={item} site={props.site} updated={props.updated} />
        {props.query && <Highlighted text={item.text} query={props.query} />}
      </span>
      {item.state === "draft" && <span class="badge badge-draft">{t("drafts.badge")}</span>}
      {item.state === "archived" && <span class="badge badge-draft">{t("content.archivedBadge")}</span>}
      {route && <ChevronRight class="chevron" size={18} aria-hidden="true" />}
    </>
  );
  return (
    <li>
      {route ? (
        <a class="row row-link" href={hrefFor(route)} onClick={linkHandler(route)}>
          {inner}
        </a>
      ) : (
        <div class="row">{inner}</div>
      )}
    </li>
  );
}

/** Spinner while the list is read for the first time, or a retry button if that failed. */
export function ContentPlaceholder(props: { error: boolean; refresh: () => void }) {
  if (props.error) {
    return (
      <div class="empty-state">
        <p class="secondary">{t("content.loadError")}</p>
        <button type="button" class="btn btn-tinted" onClick={props.refresh}>
          {t("content.retry")}
        </button>
      </div>
    );
  }
  return (
    <div class="empty-state" role="status">
      <span class="spinner" aria-hidden="true" />
      <span class="secondary">{t("content.loading")}</span>
    </div>
  );
}

export function ContentList(props: { me: Me; kind: ItemKind }) {
  useLanguage();
  const { site, content, updating, error, refresh } = useContent(props.me);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  /** Categories to show (any of them); empty for all. */
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  /** Years whose posts are shown; the current year to begin with. */
  const [openYears, setOpenYears] = useState<Set<string>>(() => new Set([String(new Date().getFullYear())]));

  const ofKind = useMemo(() => content?.items.filter((i) => i.kind === props.kind && i.state !== "bin") ?? [], [content, props.kind]);
  const search = useMemo(() => createSearch(ofKind), [ofKind]);

  const shown = useMemo(() => {
    let list = ofKind.filter((i) => (filter === "all" ? i.state !== "archived" : i.state === filter));
    if (categories.length && site) {
      // A category also shows the posts of the categories below it.
      const wanted = withDescendants(site.categories, categories);
      list = list.filter((i) => i.categories.some((c) => wanted.has(c)));
    }
    if (query.trim()) {
      const rank = new Map(search.find(query).map((p, n) => [p, n]));
      return list.filter((i) => rank.has(i.path)).sort((a, b) => rank.get(a.path)! - rank.get(b.path)!);
    }
    const time = (i: ContentItem) => (Number.isNaN(i.time) ? -Infinity : i.time);
    return props.kind === "post" ? list.sort((a, b) => time(b) - time(a)) : list.sort((a, b) => a.title.localeCompare(b.title));
  }, [ofKind, filter, categories, query, search, site]);

  const searching = query.trim() !== "";
  // Posts by year and month, newest first; while searching, in order of relevance without groups.
  const groups = useMemo(() => {
    const out: { year: string; months: { label: string; items: ContentItem[] }[] }[] = [];
    if (props.kind !== "post" || searching) return out;
    for (const item of shown) {
      const d = Number.isNaN(item.time) ? null : new Date(item.time);
      const year = d ? String(d.getFullYear()) : t("content.noDate");
      const month = d ? d.toLocaleDateString(getLanguage(), { month: "long" }) : "";
      let g = out.at(-1);
      if (g?.year !== year) out.push((g = { year, months: [] }));
      let m = g.months.at(-1);
      if (m?.label !== month) g.months.push((m = { label: month, items: [] }));
      m.items.push(item);
    }
    return out;
  }, [shown, searching]);
  const isOpen = (year: string) => openYears.has(year) || categories.length > 0 || filter !== "all";
  // Who last changed the rows on screen.
  const visible = props.kind === "post" && !searching ? groups.filter((g) => isOpen(g.year)).flatMap((g) => g.months.flatMap((m) => m.items)) : shown.slice(0, 100);
  const updated = useLastUpdated(visible);

  if (!site || !content) return <ContentPlaceholder error={error} refresh={refresh} />;

  const tree = categoryTree(site.categories);
  const categoryLabel =
    categories.length === 0
      ? t("content.anyCategory")
      : categories.length === 1
        ? (tree.find((c) => c.slug === categories[0])?.title ?? categories[0]!)
        : t("content.categoriesCount", { n: String(categories.length) });
  const filters: [Filter, string][] = [
    ["all", t("content.filterAll")],
    ["draft", t("content.filterDrafts")],
    ["archived", t("content.filterArchived")],
  ];
  const toggleYear = (year: string) =>
    setOpenYears((s) => {
      const next = new Set(s);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });

  return (
    <div class="content-list">
      <div class="list-controls">
        <div class="search-row">
          <label class="search-field">
            <SearchIcon size={17} aria-hidden="true" />
            <input
              type="search"
              value={query}
              placeholder={props.kind === "post" ? t("content.searchPosts") : t("content.searchPages")}
              aria-label={props.kind === "post" ? t("content.searchPosts") : t("content.searchPages")}
              enterKeyHint="search"
              onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            />
            {query && (
              <button type="button" class="search-clear" onClick={() => setQuery("")} aria-label={t("content.clearSearch")}>
                <X size={15} aria-hidden="true" />
              </button>
            )}
          </label>
          <button type="button" class="btn-plain icon-button" onClick={refresh} disabled={updating} aria-label={t("content.refresh")} title={t("content.refresh")}>
            <RotateCw size={18} class={updating ? "spinning" : ""} aria-hidden="true" />
          </button>
        </div>
        <div class="list-filters">
          <div class="segmented" role="radiogroup" aria-label={t("content.filter")}>
            {filters.map(([f, label]) => (
              <button type="button" role="radio" aria-checked={filter === f} class={filter === f ? "selected" : ""} onClick={() => setFilter(f)}>
                {label}
              </button>
            ))}
          </div>
          {site.categories.length > 0 && (
            <button type="button" class={`btn btn-small ${categories.length ? "btn-tinted" : "btn-plain"}`} onClick={() => setCategoryOpen(true)}>
              {categoryLabel}
              <ChevronDown size={16} aria-hidden="true" />
            </button>
          )}
        </div>
        {content.stale && <p class="banner editor-banner">{t("content.offline")}</p>}
      </div>

      {shown.length === 0 ? (
        <div class="empty-state">
          <p class="secondary">
            {searching || categories.length || filter !== "all" ? t("content.noMatches") : props.kind === "post" ? t("content.noPosts") : t("content.noPages")}
          </p>
        </div>
      ) : props.kind === "post" && !searching ? (
        groups.map((g) => {
          const open = isOpen(g.year);
          const count = g.months.reduce((n, m) => n + m.items.length, 0);
          return (
            <section class="year-group">
              <button type="button" class="year-header" aria-expanded={open} onClick={() => toggleYear(g.year)}>
                {open ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
                <span>{g.year}</span>
                <span class="secondary">{count}</span>
              </button>
              {open &&
                g.months.map((m) => (
                  <>
                    {m.label && <h3 class="list-section-header">{m.label}</h3>}
                    <ul class="grouped-list">
                      {m.items.map((item) => (
                        <ContentRow item={item} site={site} updated={updated.get(item.path)} />
                      ))}
                    </ul>
                  </>
                ))}
            </section>
          );
        })
      ) : (
        <ul class="grouped-list">
          {shown.map((item) => (
            <ContentRow item={item} site={site} query={query} updated={updated.get(item.path)} />
          ))}
        </ul>
      )}

      <Sheet open={categoryOpen} onClose={() => setCategoryOpen(false)} title={t("editor.categories")} doneLabel={t("account.done")}>
        <ul class="grouped-list">
          <li>
            <button type="button" class="row row-button-left" onClick={() => setCategories([])} disabled={!categories.length}>
              <span class="row-label">{t("content.anyCategory")}</span>
            </button>
          </li>
        </ul>
        <ul class="grouped-list">
          {tree.map((c) => {
            const checked = categories.includes(c.slug);
            return (
              <li>
                <label class="row row-check" style={{ "--depth": c.depth }}>
                  <span class="row-label" title={c.path.join(" › ")}>
                    {c.title}
                  </span>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setCategories((list) => (list.includes(c.slug) ? list.filter((x) => x !== c.slug) : [...list, c.slug]))}
                  />
                </label>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </div>
  );
}
