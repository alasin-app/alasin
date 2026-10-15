// SPDX-License-Identifier: MIT
// The Posts and Pages sections: everything in the site repository of one kind,
// with as-you-type search, a state filter and a category filter. Posts are
// grouped by year and month (newest first), pages listed by title. Archived
// items show only under their filter, items in the Bin not at all.

import {
  Check,
  ChevronDown,
  ChevronRight,
  RotateCw,
  Search as SearchIcon,
  X,
} from "lucide-preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { categoryTree } from "../../shared/categories";
import type { Me } from "../lib/api";
import type { ContentItem, ItemKind } from "../lib/content-index";
import { type LoadedContent, loadContent } from "../lib/content-store";
import { getLanguage, t, useLanguage } from "../lib/i18n";
import { hrefFor, linkHandler, type Route } from "../lib/router";
import { createSearch, snippet } from "../lib/search";
import { loadSite, type SiteSettings } from "../lib/site";
import { Sheet } from "./Sheet";

type Filter = "all" | "draft" | "archived";

/** Where a row leads; null while it can't be opened yet. */
function routeFor(item: ContentItem): Route | null {
  if (
    item.state === "draft" &&
    item.draftId &&
    item.path.endsWith(`/${item.draftId}.md`)
  ) {
    return { name: "editor", type: item.kind, id: item.draftId };
  }
  return null;
}

function Highlighted(props: { text: string; query: string }) {
  const parts = snippet(props.text, props.query);
  if (!parts) return null;
  return (
    <span class="row-snippet">
      {parts.map((p) => (p.match ? <mark>{p.text}</mark> : p.text))}
    </span>
  );
}

function Row(props: { item: ContentItem; site: SiteSettings; query: string }) {
  const { item } = props;
  const route = routeFor(item);
  const title = (slug: string) =>
    props.site.categories.find((c) => c.slug === slug)?.title ?? slug;
  const date = Number.isNaN(item.time)
    ? ""
    : new Date(item.time).toLocaleDateString(getLanguage(), {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
  const inner = (
    <>
      <span class="row-label">
        {item.title}
        <span class="row-subtitle">
          {[date, ...item.categories.map(title)].filter(Boolean).join(" · ")}
        </span>
        {props.query && <Highlighted text={item.text} query={props.query} />}
      </span>
      {item.state === "draft" && (
        <span class="badge badge-draft">{t("drafts.badge")}</span>
      )}
      {item.state === "archived" && (
        <span class="badge badge-draft">{t("content.archivedBadge")}</span>
      )}
      {route && <ChevronRight class="chevron" size={18} aria-hidden="true" />}
    </>
  );
  return (
    <li>
      {route ? (
        <a
          class="row row-link"
          href={hrefFor(route)}
          onClick={linkHandler(route)}
        >
          {inner}
        </a>
      ) : (
        <div class="row">{inner}</div>
      )}
    </li>
  );
}

export function ContentList(props: { me: Me; kind: ItemKind }) {
  useLanguage();
  const [site, setSite] = useState<SiteSettings | null>(null);
  const [content, setContent] = useState<LoadedContent | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [category, setCategory] = useState<string | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  /** Years whose posts are shown; the current year to begin with. */
  const [openYears, setOpenYears] = useState<Set<string>>(
    () => new Set([String(new Date().getFullYear())]),
  );

  const load = async (force = false) => {
    setRefreshing(true);
    try {
      const s = await loadSite();
      setSite(s);
      setContent(await loadContent(props.me.user.id, s.folders, { force }));
      setError(false);
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const ofKind = useMemo(
    () =>
      content?.items.filter(
        (i) => i.kind === props.kind && i.state !== "bin",
      ) ?? [],
    [content, props.kind],
  );
  const search = useMemo(() => createSearch(ofKind), [ofKind]);

  const shown = useMemo(() => {
    let list = ofKind.filter((i) =>
      filter === "all" ? i.state !== "archived" : i.state === filter,
    );
    if (category) list = list.filter((i) => i.categories.includes(category));
    if (query.trim()) {
      const rank = new Map(search.find(query).map((p, n) => [p, n]));
      return list
        .filter((i) => rank.has(i.path))
        .sort((a, b) => rank.get(a.path)! - rank.get(b.path)!);
    }
    return props.kind === "post"
      ? list.sort(
          (a, b) =>
            (Number.isNaN(b.time) ? -Infinity : b.time) -
            (Number.isNaN(a.time) ? -Infinity : a.time),
        )
      : list.sort((a, b) => a.title.localeCompare(b.title));
  }, [ofKind, filter, category, query, search]);

  if (error && !content) {
    return (
      <div class="empty-state">
        <p class="secondary">{t("content.loadError")}</p>
        <button
          type="button"
          class="btn btn-tinted"
          onClick={() => void load(true)}
        >
          {t("content.retry")}
        </button>
      </div>
    );
  }
  if (!site || !content) {
    return (
      <div class="empty-state" role="status">
        <span class="spinner" aria-hidden="true" />
        <span class="visually-hidden">{t("content.loading")}</span>
      </div>
    );
  }

  const tree = categoryTree(site.categories);
  const categoryName = category
    ? (tree.find((c) => c.slug === category)?.title ?? category)
    : null;
  const searching = query.trim() !== "";

  // Posts by year and month, newest first; while searching, in order of relevance without groups.
  const groups: {
    year: string;
    months: { label: string; items: ContentItem[] }[];
  }[] = [];
  if (props.kind === "post" && !searching) {
    for (const item of shown) {
      const d = Number.isNaN(item.time) ? null : new Date(item.time);
      const year = d ? String(d.getFullYear()) : t("content.noDate");
      const month = d
        ? d.toLocaleDateString(getLanguage(), { month: "long" })
        : "";
      let g = groups.at(-1);
      if (g?.year !== year) groups.push((g = { year, months: [] }));
      let m = g.months.at(-1);
      if (m?.label !== month) g.months.push((m = { label: month, items: [] }));
      m.items.push(item);
    }
  }

  const filters: [Filter, string][] = [
    ["all", t("content.filterAll")],
    ["draft", t("content.filterDrafts")],
    ["archived", t("content.filterArchived")],
  ];

  return (
    <div class="content-list">
      <div class="list-controls">
        <div class="search-row">
          <label class="search-field">
            <SearchIcon size={17} aria-hidden="true" />
            <input
              type="search"
              value={query}
              placeholder={
                props.kind === "post"
                  ? t("content.searchPosts")
                  : t("content.searchPages")
              }
              aria-label={
                props.kind === "post"
                  ? t("content.searchPosts")
                  : t("content.searchPages")
              }
              enterKeyHint="search"
              onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            />
            {query && (
              <button
                type="button"
                class="search-clear"
                onClick={() => setQuery("")}
                aria-label={t("content.clearSearch")}
              >
                <X size={15} aria-hidden="true" />
              </button>
            )}
          </label>
          <button
            type="button"
            class="btn-plain icon-button"
            onClick={() => void load(true)}
            disabled={refreshing}
            aria-label={t("content.refresh")}
            title={t("content.refresh")}
          >
            <RotateCw
              size={18}
              class={refreshing ? "spinning" : ""}
              aria-hidden="true"
            />
          </button>
        </div>
        <div class="list-filters">
          <div
            class="segmented"
            role="radiogroup"
            aria-label={t("content.filter")}
          >
            {filters.map(([f, label]) => (
              <button
                type="button"
                role="radio"
                aria-checked={filter === f}
                class={filter === f ? "selected" : ""}
                onClick={() => setFilter(f)}
              >
                {label}
              </button>
            ))}
          </div>
          {site.categories.length > 0 && (
            <button
              type="button"
              class={`btn btn-small ${category ? "btn-tinted" : "btn-plain"}`}
              onClick={() => setCategoryOpen(true)}
            >
              {categoryName ?? t("content.anyCategory")}
              <ChevronDown size={16} aria-hidden="true" />
            </button>
          )}
        </div>
        {content.stale && (
          <p class="banner editor-banner">{t("content.offline")}</p>
        )}
      </div>

      {shown.length === 0 ? (
        <div class="empty-state">
          <p class="secondary">
            {searching || category || filter !== "all"
              ? t("content.noMatches")
              : props.kind === "post"
                ? t("content.noPosts")
                : t("content.noPages")}
          </p>
        </div>
      ) : props.kind === "post" && !searching ? (
        groups.map((g) => {
          const open =
            openYears.has(g.year) || category !== null || filter !== "all";
          const count = g.months.reduce((n, m) => n + m.items.length, 0);
          return (
            <section class="year-group">
              <button
                type="button"
                class="year-header"
                aria-expanded={open}
                onClick={() =>
                  setOpenYears((s) => {
                    const next = new Set(s);
                    if (next.has(g.year)) next.delete(g.year);
                    else next.add(g.year);
                    return next;
                  })
                }
              >
                {open ? (
                  <ChevronDown size={18} aria-hidden="true" />
                ) : (
                  <ChevronRight size={18} aria-hidden="true" />
                )}
                <span>{g.year}</span>
                <span class="secondary">{count}</span>
              </button>
              {open &&
                g.months.map((m) => (
                  <>
                    {m.label && <h3 class="list-section-header">{m.label}</h3>}
                    <ul class="grouped-list">
                      {m.items.map((item) => (
                        <Row item={item} site={site} query="" />
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
            <Row item={item} site={site} query={query} />
          ))}
        </ul>
      )}

      <Sheet
        open={categoryOpen}
        onClose={() => setCategoryOpen(false)}
        title={t("editor.categories")}
        doneLabel={t("account.done")}
      >
        <ul class="grouped-list">
          {[
            {
              slug: null as string | null,
              title: t("content.anyCategory"),
              depth: 0,
            },
            ...tree,
          ].map((c) => (
            <li>
              <button
                type="button"
                class="row row-check"
                style={{ "--depth": c.depth }}
                aria-pressed={category === c.slug}
                onClick={() => {
                  setCategory(c.slug);
                  setCategoryOpen(false);
                }}
              >
                <span class="row-label">{c.title}</span>
                {category === c.slug && (
                  <Check size={20} class="check-mark" aria-hidden="true" />
                )}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}
