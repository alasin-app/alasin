// SPDX-License-Identifier: MIT
// The Posts and Pages sections: everything in the site repository of one kind,
// with as-you-type search, a state filter and a category filter. Posts are
// grouped by year and month (newest first), pages listed by title. Archived
// items show only under their filter, items in the Bin not at all.

import { ChevronDown, ChevronRight, RotateCw, Search as SearchIcon, X } from "lucide-preact";
import { useMemo, useState } from "preact/hooks";
import { categoryTree } from "../../shared/categories";
import { api, ApiError, type Me } from "../lib/api";
import { type ContentItem, type ItemKind, valueCounts } from "../lib/content-index";
import { getLanguage, t, useLanguage } from "../lib/i18n";
import { hrefFor, linkHandler, navigate, type Route } from "../lib/router";
import { createSearch, snippet } from "../lib/search";
import type { SiteSettings } from "../lib/site";
import { type Holder, lockKey, useLocks } from "../lib/edit-lock";
import { type LastUpdate, useLastUpdated } from "../lib/last-updated";
import { useContent } from "../lib/use-content";
import { PickerSheet } from "./PickerSheet";
import { ActionSheet } from "./Sheet";

type Filter = "all" | "draft" | "archived";

/** Where a row leads; null while it can't be opened yet (archived items, the Bin). */
export function routeFor(item: ContentItem): Route | null {
  if (item.state === "draft" && item.draftId && item.path.endsWith(`/${item.draftId}.md`)) {
    return { name: "editor", type: item.kind, id: item.draftId };
  }
  // Published, or marked draft in the content folders.
  if (item.state === "published" || item.state === "draft") return { name: "file", path: item.path };
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
  // The git author's name, as the site shows it (Hugo's git info).
  const by = updated ? updated.name || updated.login || "" : "";
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

export function ContentRow(props: {
  item: ContentItem;
  site: SiteSettings;
  query?: string;
  showKind?: boolean;
  note?: string;
  updated?: LastUpdate;
  /** Who is editing it right now. */
  editing?: Holder;
  /** For rows without a page of their own (archived): what tapping does. */
  onActivate?: () => void;
}) {
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
        {props.editing && <span class="row-editing">{t("content.beingEdited", { name: props.editing.name ?? props.editing.login })}</span>}
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
      ) : props.onActivate ? (
        <button type="button" class="row row-button-left" onClick={props.onActivate}>
          {inner}
        </button>
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
  /** Categories, authors and tags to show (any of each); empty for all. */
  const [categories, setCategories] = useState<string[]>([]);
  const [authors, setAuthors] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [picker, setPicker] = useState<"categories" | "authors" | "tags" | null>(null);
  /** An archived item waiting for "Republish" to be confirmed, and any error. */
  const [republishing, setRepublishing] = useState<ContentItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const republish = async (item: ContentItem) => {
    setActionError(null);
    try {
      const res = await api<{ path: string }>("/api/lifecycle", { method: "POST", body: { action: "republish", path: item.path, sha: item.sha } });
      refresh();
      navigate({ name: "file", path: res.path });
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("error.generic"));
    }
  };
  /** Years whose posts are shown; the current year to begin with. */
  const [openYears, setOpenYears] = useState<Set<string>>(() => new Set([String(new Date().getFullYear())]));

  const ofKind = useMemo(() => content?.items.filter((i) => i.kind === props.kind && i.state !== "bin") ?? [], [content, props.kind]);
  const search = useMemo(() => createSearch(ofKind), [ofKind]);

  const shown = useMemo(() => {
    let list = ofKind.filter((i) => (filter === "all" ? i.state !== "archived" : i.state === filter));
    // Posts that have any of the chosen categories themselves (not the categories below them).
    if (categories.length) list = list.filter((i) => i.categories.some((c) => categories.includes(c)));
    if (authors.length) list = list.filter((i) => authors.includes(i.author));
    if (tags.length) list = list.filter((i) => i.tags.some((x) => tags.includes(x)));
    if (query.trim()) {
      const rank = new Map(search.find(query).map((p, n) => [p, n]));
      return list.filter((i) => rank.has(i.path)).sort((a, b) => rank.get(a.path)! - rank.get(b.path)!);
    }
    const time = (i: ContentItem) => (Number.isNaN(i.time) ? -Infinity : i.time);
    return props.kind === "post" ? list.sort((a, b) => time(b) - time(a)) : list.sort((a, b) => a.title.localeCompare(b.title));
  }, [ofKind, filter, categories, authors, tags, query, search]);
  const authorCounts = useMemo(() => valueCounts(ofKind, (i) => i.author), [ofKind]);
  const tagCounts = useMemo(() => valueCounts(ofKind, (i) => i.tags), [ofKind]);
  const filtering = categories.length > 0 || authors.length > 0 || tags.length > 0 || filter !== "all";

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
  const isOpen = (year: string) => openYears.has(year) || filtering;
  // Who last changed the rows on screen.
  const visible = props.kind === "post" && !searching ? groups.filter((g) => isOpen(g.year)).flatMap((g) => g.months.flatMap((m) => m.items)) : shown.slice(0, 100);
  const updated = useLastUpdated(visible);
  const locks = useLocks();

  if (!site || !content) return <ContentPlaceholder error={error} refresh={refresh} />;

  const tree = categoryTree(site.categories);
  /** A filter button's label: "All …", the one chosen, or how many. */
  const pickLabel = (list: string[], all: string, label: (v: string) => string) =>
    list.length === 0 ? all : list.length === 1 ? label(list[0]!) : t("content.chosenCount", { n: String(list.length) });
  const categoryLabel = pickLabel(categories, t("content.anyCategory"), (v) => tree.find((c) => c.slug === v)?.title ?? v);
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
            <button type="button" class={`btn btn-small ${categories.length ? "btn-tinted" : "btn-plain"}`} onClick={() => setPicker("categories")}>
              {categoryLabel}
              <ChevronDown size={16} aria-hidden="true" />
            </button>
          )}
          {authorCounts.length > 0 && (
            <button type="button" class={`btn btn-small ${authors.length ? "btn-tinted" : "btn-plain"}`} onClick={() => setPicker("authors")}>
              {pickLabel(authors, t("content.anyAuthor"), (v) => v)}
              <ChevronDown size={16} aria-hidden="true" />
            </button>
          )}
          {tagCounts.length > 0 && (
            <button type="button" class={`btn btn-small ${tags.length ? "btn-tinted" : "btn-plain"}`} onClick={() => setPicker("tags")}>
              {pickLabel(tags, t("content.anyTag"), (v) => v)}
              <ChevronDown size={16} aria-hidden="true" />
            </button>
          )}
        </div>
        {content.stale && <p class="banner editor-banner">{t("content.offline")}</p>}
        {actionError && (
          <p class="banner banner-error editor-banner" role="alert">
            {actionError}
          </p>
        )}
      </div>

      {shown.length === 0 ? (
        <div class="empty-state">
          <p class="secondary">
            {searching || filtering ? t("content.noMatches") : props.kind === "post" ? t("content.noPosts") : t("content.noPages")}
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
                        <ContentRow
                          item={item}
                          site={site}
                          updated={updated.get(item.path)}
                          editing={locks.get(lockKey(item))}
                          onActivate={item.state === "archived" ? () => setRepublishing(item) : undefined}
                        />
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
            <ContentRow
              item={item}
              site={site}
              query={query}
              updated={updated.get(item.path)}
              editing={locks.get(lockKey(item))}
              onActivate={item.state === "archived" ? () => setRepublishing(item) : undefined}
            />
          ))}
        </ul>
      )}

      <ActionSheet
        open={republishing !== null}
        onClose={() => setRepublishing(null)}
        title={republishing ? t("content.republishTitle", { title: republishing.title }) : ""}
        message={t("content.republishMessage")}
        actions={republishing ? [{ label: t("content.republish"), onSelect: () => void republish(republishing) }] : []}
        cancelLabel={t("common.cancel")}
      />
      <PickerSheet
        open={picker === "categories"}
        onClose={() => setPicker(null)}
        title={t("editor.categories")}
        allLabel={t("content.anyCategory")}
        options={tree.map((c) => ({ value: c.slug, label: c.title, depth: c.depth, hint: c.path.join(" › ") }))}
        selected={categories}
        onChange={setCategories}
      />
      <PickerSheet
        open={picker === "authors"}
        onClose={() => setPicker(null)}
        title={t("content.authors")}
        allLabel={t("content.anyAuthor")}
        options={authorCounts.map((a) => ({ value: a.value, label: a.value, count: a.count }))}
        selected={authors}
        onChange={setAuthors}
      />
      <PickerSheet
        open={picker === "tags"}
        onClose={() => setPicker(null)}
        title={t("editor.tags")}
        allLabel={t("content.anyTag")}
        options={tagCounts.map((x) => ({ value: x.value, label: x.value, count: x.count }))}
        selected={tags}
        onChange={setTags}
        searchable
      />
    </div>
  );
}
