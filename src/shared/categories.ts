// SPDX-License-Identifier: MIT
//
// Categories can be nested: a category names its parent (by slug) in its own
// front matter or data file entry, e.g. `parent: "travel"`. Posts list only
// the categories chosen for them; a child doesn't imply its parent.

import { joinFile, parseFields, setFields, splitFrontMatter } from "./frontmatter";

export interface Category {
  slug: string;
  title: string;
  /** Slug of the parent category, if it has one. */
  parent?: string;
}

export interface CategoryNode extends Category {
  /** 0 for top-level categories. */
  depth: number;
  /** Titles from the top-level category down to this one. */
  path: string[];
}

const byTitle = (a: Category, b: Category) => a.title.localeCompare(b.title);

/**
 * Categories in tree order: each parent followed by its children, siblings by
 * title. A missing parent, or a loop of parents, makes a category top-level.
 */
export function categoryTree(categories: Category[]): CategoryNode[] {
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  // The parent counts only if following parents from it never comes back.
  const parentOf = (c: Category): string | undefined => {
    if (!c.parent || !bySlug.has(c.parent)) return undefined;
    const seen = new Set([c.slug]);
    for (let p: string | undefined = c.parent; p; p = bySlug.get(p)?.parent) {
      if (seen.has(p)) return undefined;
      seen.add(p);
      if (!bySlug.has(p)) break;
    }
    return c.parent;
  };
  const children = new Map<string | undefined, Category[]>();
  for (const c of categories) {
    const p = parentOf(c);
    children.set(p, [...(children.get(p) ?? []), c]);
  }
  const out: CategoryNode[] = [];
  const walk = (parent: string | undefined, depth: number, path: string[]) => {
    for (const c of (children.get(parent) ?? []).sort(byTitle)) {
      const node = { ...c, depth, path: [...path, c.title] };
      out.push(node);
      walk(c.slug, depth + 1, node.path);
    }
  };
  walk(undefined, 0, []);
  return out;
}

/**
 * The file with its list of categories changed by `edit`, changing only that
 * front matter line (the field goes if no category is left); null if it
 * doesn't have `slug`.
 */
function editCategories(text: string, slug: string, edit: (list: string[]) => string[]): string | null {
  const split = splitFrontMatter(text);
  if (!split) return null;
  const value = parseFields(split.format, split.raw).get("categories");
  const list = Array.isArray(value) ? value.map(String) : typeof value === "string" && value ? [value] : [];
  if (!list.includes(slug)) return null;
  const rest = edit(list);
  return joinFile(split.format, setFields(split.format, split.raw, [["categories", rest.length ? rest : undefined]]), split.body);
}

/** The file without `slug` among its categories; null if it doesn't have it. */
export function withoutCategory(text: string, slug: string): string | null {
  return editCategories(text, slug, (list) => list.filter((c) => c !== slug));
}

/**
 * The file with category `from` renamed to `to`, in the same place in the
 * list (only once, if it already has `to`); null if it doesn't have `from`.
 */
export function withCategoryRenamed(text: string, from: string, to: string): string | null {
  return editCategories(text, from, (list) => [...new Set(list.map((c) => (c === from ? to : c)))]);
}
