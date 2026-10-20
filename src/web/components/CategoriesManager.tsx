// SPDX-License-Identifier: MIT
// The Categories section: the category tree with how many posts and pages use
// each, adding categories (also under a parent), renaming and moving them
// (a new address renames it in every post and page, in one commit), and
// deleting them. Deleting a
// used one takes it out of every post and page that has it, in one commit,
// after a warning; a category with subcategories can't be deleted.

import { Plus } from "lucide-preact";
import { useEffect, useState } from "preact/hooks";
import { categoryTree, withCategoryRenamed, withoutCategory } from "../../shared/categories";
import { slugify } from "../../shared/frontmatter";
import { api, ApiError, type Me } from "../lib/api";
import type { ContentItem } from "../lib/content-index";
import { t, useLanguage } from "../lib/i18n";
import { loadSite, reloadSite, type SiteSettings } from "../lib/site";
import { useContent } from "../lib/use-content";
import { ContentPlaceholder } from "./ContentList";
import { ActionSheet, Sheet } from "./Sheet";

type Node = ReturnType<typeof categoryTree>[number];

export function CategoriesManager(props: { me: Me }) {
  useLanguage();
  const { content, error, refresh, update } = useContent(props.me);
  const [site, setSite] = useState<SiteSettings | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState<Node | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Node | null>(null);
  // The add sheet, or the edit sheet when it has the category being edited.
  const [adding, setAdding] = useState<{ parent: string; editing?: Node } | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  const readSite = () => {
    reloadSite();
    loadSite().then(setSite, () => setMessage(t("error.generic")));
  };
  useEffect(() => readSite(), []);

  if (!site || !content) return <ContentPlaceholder error={error} refresh={refresh} />;

  const tree = categoryTree(site.categories);
  // Every post, page and draft that has a category, also in the archive and the Bin.
  const usedBy = (slug: string): ContentItem[] => content.items.filter((i) => i.categories.includes(slug));
  const childrenOf = (slug: string) => site.categories.filter((c) => c.parent === slug);
  /** Whether category `slug` is somewhere below `ancestor`. */
  const isBelow = (slug: string, ancestor: string) => {
    const seen = new Set<string>();
    for (let p = site.categories.find((c) => c.slug === slug)?.parent; p && !seen.has(p); p = site.categories.find((c) => c.slug === p)?.parent) {
      if (p === ancestor) return true;
      seen.add(p);
    }
    return false;
  };

  const openAdd = (parent = "") => {
    setTitle("");
    setSlug("");
    setSlugEdited(false);
    setAdding({ parent });
  };

  const openEdit = (node: Node) => {
    setTitle(node.title);
    setSlug(node.slug);
    setSlugEdited(true);
    setAdding({ parent: node.parent ?? "", editing: node });
  };

  /** The files that have category `from`, read fresh, changed by `edit` (null: not changed). */
  const changedFiles = async (from: string, edit: (text: string) => string | null) => {
    const items = usedBy(from);
    const changes: { path: string; sha: string; content: string }[] = [];
    for (let i = 0; i < items.length; i += 100) {
      const batch = items.slice(i, i + 100);
      const res = await api<{ data?: { repository?: Record<string, { oid?: string; text?: string | null } | null> } }>("/api/content/files", {
        method: "POST",
        body: { paths: batch.map((x) => x.path) },
      });
      batch.forEach((item, k) => {
        const blob = res.data?.repository?.[`p${k}`];
        const text = typeof blob?.text === "string" ? edit(blob.text) : null;
        if (blob?.oid && text !== null) changes.push({ path: item.path, sha: blob.oid, content: text });
      });
    }
    return changes;
  };

  const add = async () => {
    if (!adding || !title.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const node = adding.editing;
      if (node) {
        const newSlug = slug || node.slug;
        const changes = newSlug !== node.slug ? await changedFiles(node.slug, (text) => withCategoryRenamed(text, node.slug, newSlug)) : [];
        await api("/api/categories/update", { method: "POST", body: { slug: node.slug, title: title.trim(), newSlug, parent: adding.parent, changes } });
        update();
      } else {
        await api("/api/categories", { method: "POST", body: { title: title.trim(), slug: slug || undefined, parent: adding.parent || undefined } });
      }
      setAdding(null);
      readSite();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : t("error.generic"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (node: Node) => {
    setBusy(true);
    setMessage(null);
    try {
      // The posts and pages that have it, without it.
      const changes = await changedFiles(node.slug, (text) => withoutCategory(text, node.slug));
      await api("/api/categories/delete", { method: "POST", body: { slug: node.slug, changes } });
      readSite();
      update();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : t("error.generic"));
    } finally {
      setBusy(false);
    }
  };

  const used = confirmDelete ? usedBy(confirmDelete.slug).length : 0;

  return (
    <>
      <div class="list-controls">
        {site.categoriesEditable ? (
          <button type="button" class="btn btn-small btn-tinted add-category" disabled={busy} onClick={() => openAdd()}>
            <Plus size={16} aria-hidden="true" />
            {t("categories.add")}
          </button>
        ) : (
          <p class="secondary list-note">{t("categories.notEditable")}</p>
        )}
        {message && (
          <p class="banner banner-error editor-banner" role="alert">
            {message}
          </p>
        )}
      </div>
      {tree.length === 0 ? (
        <div class="empty-state">
          <p class="secondary">{t("editor.noCategories")}</p>
        </div>
      ) : (
        <ul class="grouped-list">
          {tree.map((node) => {
            const n = usedBy(node.slug).length;
            const row = (
              <span class="row-label">
                {node.title}
                <span class="row-subtitle">{[n ? t("categories.usedBy", { n: String(n) }) : t("categories.unused"), node.slug].join(" · ")}</span>
              </span>
            );
            return (
              <li>
                {site.categoriesEditable ? (
                  <button type="button" class="row row-button-left row-check" style={{ "--depth": node.depth }} disabled={busy} onClick={() => setChosen(node)}>
                    {row}
                  </button>
                ) : (
                  <div class="row row-check" style={{ "--depth": node.depth }}>
                    {row}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ActionSheet
        open={chosen !== null}
        onClose={() => setChosen(null)}
        title={chosen?.path.join(" › ")}
        message={chosen && childrenOf(chosen.slug).length ? t("categories.hasChildren") : undefined}
        actions={
          chosen
            ? [
                { label: t("categories.addSub"), onSelect: () => openAdd(chosen.slug) },
                { label: t("categories.edit"), onSelect: () => openEdit(chosen) },
                ...(childrenOf(chosen.slug).length ? [] : [{ label: t("editor.delete"), destructive: true, onSelect: () => setConfirmDelete(chosen) }]),
              ]
            : []
        }
        cancelLabel={t("common.cancel")}
      />
      <ActionSheet
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title={confirmDelete ? t("categories.deleteTitle", { title: confirmDelete.title }) : ""}
        message={used ? t("categories.deleteUsed", { n: String(used) }) : t("categories.deleteUnused")}
        actions={
          confirmDelete
            ? [{ label: used ? t("categories.removeAndDelete", { n: String(used) }) : t("editor.delete"), destructive: true, onSelect: () => void remove(confirmDelete) }]
            : []
        }
        cancelLabel={t("common.cancel")}
      />

      <Sheet open={adding !== null} onClose={() => setAdding(null)} title={adding?.editing ? t("categories.edit") : t("categories.add")} doneLabel={t("common.cancel")}>
        <form
          class="video-form"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <label class="secondary" for="category-title">
            {t("categories.name")}
          </label>
          <input
            id="category-title"
            value={title}
            onInput={(e) => {
              const v = (e.target as HTMLInputElement).value;
              setTitle(v);
              if (!slugEdited && !adding?.editing) setSlug(v.trim() ? slugify(v) : "");
            }}
          />
          <label class="secondary" for="category-slug">
            {t("editor.slug")}
          </label>
          <input
            id="category-slug"
            value={slug}
            autocapitalize="off"
            spellcheck={false}
            onInput={(e) => {
              setSlugEdited(true);
              setSlug(slugify((e.target as HTMLInputElement).value));
            }}
          />
          <label class="secondary" for="category-parent">
            {t("categories.parent")}
          </label>
          <select id="category-parent" value={adding?.parent ?? ""} onChange={(e) => adding && setAdding({ parent: (e.target as HTMLSelectElement).value })}>
            <option value="">{t("categories.topLevel")}</option>
            {/* Not under itself or anything below it. */}
            {tree.filter((c) => !adding?.editing || (c.slug !== adding.editing.slug && !isBelow(c.slug, adding.editing.slug))).map((c) => (
              <option value={c.slug}>{`${" ".repeat(c.depth)}${c.title}`}</option>
            ))}
          </select>
          {adding?.editing && slug && slug !== adding.editing.slug && (
            <p class="secondary">
              {usedBy(adding.editing.slug).length ? t("categories.addressChange", { n: String(usedBy(adding.editing.slug).length) }) : t("categories.addressChangeUnused")}
            </p>
          )}
          <button type="submit" class="btn btn-filled" disabled={busy || !title.trim()}>
            {adding?.editing ? t("categories.save") : t("categories.add")}
          </button>
        </form>
      </Sheet>
    </>
  );
}
