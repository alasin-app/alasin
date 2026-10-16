// SPDX-License-Identifier: MIT
// A sheet for choosing any number of values from a list (categories, authors,
// tags), with an optional search field for long lists.

import { Search as SearchIcon } from "lucide-preact";
import { useState } from "preact/hooks";
import { t } from "../lib/i18n";
import { fold } from "../lib/search";
import { Sheet } from "./Sheet";

export interface PickerOption {
  value: string;
  label: string;
  /** How many items have it, shown after the label. */
  count?: number;
  /** Indentation level (category tree). */
  depth?: number;
  /** Tooltip, e.g. a category's full path. */
  hint?: string;
}

export function PickerSheet(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  options: PickerOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  /** Label of the row that clears the selection, e.g. "All tags". */
  allLabel: string;
  searchable?: boolean;
}) {
  const [query, setQuery] = useState("");
  const q = fold(query.trim());
  const shown = q ? props.options.filter((o) => fold(o.label).includes(q)) : props.options;
  const toggle = (value: string) =>
    props.onChange(props.selected.includes(value) ? props.selected.filter((x) => x !== value) : [...props.selected, value]);
  return (
    <Sheet open={props.open} onClose={props.onClose} title={props.title} doneLabel={t("account.done")}>
      {props.searchable && (
        <label class="search-field sheet-search">
          <SearchIcon size={17} aria-hidden="true" />
          <input type="search" value={query} placeholder={t("content.filterSearch")} aria-label={t("content.filterSearch")} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
        </label>
      )}
      <ul class="grouped-list">
        <li>
          <button type="button" class="row row-button-left" onClick={() => props.onChange([])} disabled={!props.selected.length}>
            <span class="row-label">{props.allLabel}</span>
          </button>
        </li>
      </ul>
      <ul class="grouped-list">
        {shown.map((o) => (
          <li>
            <label class="row row-check" style={{ "--depth": o.depth ?? 0 }}>
              <span class="row-label" title={o.hint}>
                {o.label}
                {o.count !== undefined && <span class="secondary"> {o.count}</span>}
              </span>
              <input type="checkbox" checked={props.selected.includes(o.value)} onChange={() => toggle(o.value)} />
            </label>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
