// SPDX-License-Identifier: MIT
// The tags field: comma-separated, with the site's known tags suggested as
// you type (most used first). Tapping a suggestion completes the tag.

import { useEffect, useRef, useState } from "preact/hooks";
import { t } from "../lib/i18n";
import { fold } from "../lib/search";

const parse = (text: string) =>
  text
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export function TagsInput(props: { id: string; value: string[]; known: { value: string; count: number }[]; onChange: (tags: string[]) => void }) {
  const [text, setText] = useState(props.value.join(", "));
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Follows changes from elsewhere (e.g. the Markdown mode) while not typing here.
  useEffect(() => {
    if (!focused) setText(props.value.join(", "));
  }, [props.value.join(","), focused]);

  const typed = fold(text.slice(text.lastIndexOf(",") + 1).trim());
  const chosen = new Set(parse(text).map(fold));
  const suggestions = focused && typed
    ? props.known
        .filter((k) => fold(k.value).includes(typed) && !chosen.has(fold(k.value)))
        .sort((a, b) => Number(fold(b.value).startsWith(typed)) - Number(fold(a.value).startsWith(typed)))
        .slice(0, 8)
    : [];

  const update = (next: string) => {
    setText(next);
    props.onChange(parse(next));
  };
  const pick = (tag: string) => {
    const before = text.slice(0, text.lastIndexOf(",") + 1);
    update(`${before}${before ? " " : ""}${tag}, `);
    inputRef.current?.focus();
  };

  return (
    <div class="tags-input">
      <input
        ref={inputRef}
        id={props.id}
        class="row-input"
        value={text}
        placeholder={t("editor.tagsPlaceholder")}
        autocapitalize="off"
        autocomplete="off"
        onInput={(e) => update((e.target as HTMLInputElement).value)}
        onFocus={() => setFocused(true)}
        // Later than a tap on a suggestion.
        onBlur={() => setTimeout(() => setFocused(false), 150)}
      />
      {suggestions.length > 0 && (
        <div class="tag-suggestions" role="listbox" aria-label={t("editor.tagSuggestions")}>
          {suggestions.map((s) => (
            <button type="button" role="option" class="chip chip-button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s.value)}>
              {s.value}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
