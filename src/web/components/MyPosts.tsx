// SPDX-License-Identifier: MIT
// "My posts" on the home screen: the signed-in user's published posts with the
// latest dates (by the author field; everyone's if the site has none), 5, 10
// or 20 of them as chosen on this device.

import { useState } from "preact/hooks";
import type { Me } from "../lib/api";
import { t, useLanguage } from "../lib/i18n";
import { useLastUpdated } from "../lib/last-updated";
import { useContent } from "../lib/use-content";
import { authorUser } from "../lib/authors";
import { ContentRow } from "./ContentList";

const COUNTS = [5, 10, 20] as const;
const KEY = "alasin.myPosts";

function storedCount(): number {
  try {
    const n = Number(localStorage.getItem(KEY));
    return (COUNTS as readonly number[]).includes(n) ? n : 5;
  } catch {
    return 5;
  }
}

export function MyPosts(props: { me: Me }) {
  useLanguage();
  const { site, content } = useContent(props.me);
  const [count, setCount] = useState(storedCount);
  const time = (n: number) => (Number.isNaN(n) ? -Infinity : n);
  const posts = (content?.items ?? [])
    .filter((i) => i.kind === "post" && i.state === "published")
    .filter((i) => !site?.authorField || (site && authorUser(i, site)?.id === props.me.user.id))
    .sort((a, b) => time(b.time) - time(a.time))
    .slice(0, count);
  const updated = useLastUpdated(posts);

  if (!site || !content) return null;
  const choose = (n: number) => {
    setCount(n);
    try {
      localStorage.setItem(KEY, String(n));
    } catch {
      // Private mode: only for this visit.
    }
  };
  return (
    <section class="my-posts">
      <div class="section-title-row">
        <h2 class="list-title">{t("home.myPosts")}</h2>
        <div class="segmented segmented-small" role="radiogroup" aria-label={t("home.howMany")}>
          {COUNTS.map((n) => (
            <button type="button" role="radio" aria-checked={count === n} class={count === n ? "selected" : ""} onClick={() => choose(n)}>
              {n}
            </button>
          ))}
        </div>
      </div>
      {posts.length === 0 ? (
        <p class="secondary list-note">{t("home.noPosts")}</p>
      ) : (
        <ul class="grouped-list">
          {posts.map((item) => (
            <ContentRow item={item} site={site} updated={updated.get(item.path)} />
          ))}
        </ul>
      )}
    </section>
  );
}
