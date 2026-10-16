// SPDX-License-Identifier: MIT
// The published images (MEDIA), by month, newest first. The library can be
// huge, so nothing is listed up front: the years first, the months of a year
// when the list reaches it, and a month's images when it's opened. Images are
// only added from a post or page; here they're found to look at or to reuse.

import { Check, ChevronDown, ChevronRight } from "lucide-preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { groupImages, type LibraryImage } from "../../shared/media-library";
import { api } from "../lib/api";
import { getLanguage, t, useLanguage } from "../lib/i18n";
import type { SiteSettings } from "../lib/site-types";

interface Folders {
  folders: string[];
}
interface Files {
  files: { key: string }[];
  cursor: string | null;
}

const YEAR = /(?:^|\/)(\d{4})\/$/;
const MONTH = /(?:^|\/)(\d{4})\/(\d{2})\/$/;

/** "2026/10/" → "October 2026" (in the app's language). */
export function monthLabel(prefix: string): string {
  const m = MONTH.exec(prefix);
  if (!m) return prefix;
  const text = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)).toLocaleDateString(getLanguage(), { month: "long", year: "numeric", timeZone: "UTC" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const fileName = (key: string) => key.slice(key.lastIndexOf("/") + 1);

/** Every image of one month, in as many pages as it takes. */
async function monthImages(prefix: string): Promise<LibraryImage[]> {
  const keys: string[] = [];
  let cursor: string | null = null;
  do {
    const page: Files = await api<Files>(`/api/media/files?prefix=${encodeURIComponent(prefix)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    keys.push(...page.files.map((f) => f.key));
    cursor = page.cursor;
  } while (cursor);
  return groupImages(keys);
}

function Month(props: { site: SiteSettings; prefix: string; initiallyOpen: boolean; selected?: string[]; onToggle?: (key: string) => void }) {
  const [open, setOpen] = useState(props.initiallyOpen);
  const [images, setImages] = useState<LibraryImage[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!open || images) return;
    setFailed(false);
    monthImages(props.prefix).then(setImages, () => setFailed(true));
  }, [open, failed]);
  const url = (key: string) => props.site.media.publicUrl + key;
  const label = monthLabel(props.prefix);

  return (
    <section class="media-month">
      <h3 class="media-month-header">
        <button type="button" class="btn-plain" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
          {label}
          {images && <span class="secondary media-count">{images.length}</span>}
        </button>
      </h3>
      {open &&
        (failed ? (
          <p class="secondary list-note">
            {t("media.loadFailed")}{" "}
            <button type="button" class="btn-plain" onClick={() => setFailed(false)}>
              {t("photos.retry")}
            </button>
          </p>
        ) : !images ? (
          <div class="media-loading" role="status" aria-label={t("app.loading")}>
            <span class="spinner" aria-hidden="true" />
          </div>
        ) : images.length === 0 ? (
          <p class="secondary list-note">{t("media.emptyMonth")}</p>
        ) : (
          <div class="image-grid">
            {images.map((img) => {
              const thumb = <img src={url(img.thumb)} alt="" loading="lazy" decoding="async" />;
              if (!props.onToggle) {
                return (
                  <a class="image-choice" href={url(img.key)} target="_blank" rel="noopener" aria-label={fileName(img.key)} title={fileName(img.key)}>
                    {thumb}
                  </a>
                );
              }
              const at = props.selected?.indexOf(img.key) ?? -1;
              return (
                <button type="button" class={`image-choice${at >= 0 ? " selected" : ""}`} aria-pressed={at >= 0} aria-label={fileName(img.key)} onClick={() => props.onToggle!(img.key)}>
                  {thumb}
                  {at >= 0 && <Check class="image-check" size={20} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        ))}
    </section>
  );
}

/**
 * The month list. With `onToggle`, tapping an image selects it (in the order
 * tapped, in `selected`); without, it opens the image.
 */
export function MediaLibrary(props: { site: SiteSettings; selected?: string[]; onToggle?: (key: string) => void }) {
  useLanguage();
  const { browse, byMonth } = props.site.media;
  /** Year folders whose months aren't listed yet, newest first. */
  const [years, setYears] = useState<string[] | null>(null);
  const [months, setMonths] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const folders = (prefix: string) => api<Folders>(`/api/media/folders?prefix=${encodeURIComponent(prefix)}`).then((r) => r.folders);

  useEffect(() => {
    if (!byMonth) return;
    setError(false);
    Promise.all(browse.map((p) => (YEAR.test(p) ? Promise.resolve([p]) : folders(p))))
      .then((lists) => setYears(lists.flat().filter((f) => YEAR.test(f)).sort((a, b) => YEAR.exec(b)![1]!.localeCompare(YEAR.exec(a)![1]!))))
      .catch(() => setError(true));
  }, [error]);

  // The next year's months, whenever the end of the list comes into view.
  const loadNext = () => {
    if (loading || !years?.length) return;
    setLoading(true);
    const [year, ...rest] = years;
    folders(year!).then(
      (list) => {
        setMonths((m) => [...m, ...list.filter((f) => MONTH.test(f)).sort().reverse()]);
        setYears(rest);
        setLoading(false);
      },
      () => {
        setLoading(false);
        setError(true);
      },
    );
  };
  useEffect(() => {
    const el = end.current;
    if (!el || !years?.length) return;
    const seen = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadNext(), { rootMargin: "400px" });
    seen.observe(el);
    return () => seen.disconnect();
  }, [years, loading]);

  if (!byMonth) {
    return (
      <div class="empty-state">
        <h2 class="headline">{t("media.notByMonthTitle")}</h2>
        <p class="secondary">{t("media.notByMonthBody")}</p>
      </div>
    );
  }
  if (error && !months.length) {
    return (
      <div class="empty-state">
        <p class="secondary">{t("media.loadFailed")}</p>
        <button type="button" class="btn btn-tinted" onClick={() => setError(false)}>
          {t("photos.retry")}
        </button>
      </div>
    );
  }
  if (years && !years.length && !months.length) {
    return (
      <div class="empty-state">
        <h2 class="headline">{t("media.emptyTitle")}</h2>
        <p class="secondary">{t("media.emptyBody")}</p>
      </div>
    );
  }
  return (
    <div class="media-library">
      {months.map((m, i) => (
        <Month key={m} site={props.site} prefix={m} initiallyOpen={i === 0} selected={props.selected} onToggle={props.onToggle} />
      ))}
      <div ref={end} class="media-end">
        {(!years || years.length > 0) && <span class="spinner" aria-hidden="true" />}
      </div>
    </div>
  );
}
