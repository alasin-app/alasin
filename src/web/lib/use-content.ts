// SPDX-License-Identifier: MIT
//
// The post and page list for the Posts, Pages and Drafts sections: shown at
// once from memory or IndexedDB, then brought up to date in the background.
// One update runs at a time, shared by every section.

import { useEffect, useState } from "preact/hooks";
import type { Me } from "./api";
import type { ContentIndex } from "./content-index";
import { cachedContent, type LoadedContent, updateContent } from "./content-store";
import { loadSite, type SiteSettings } from "./site";

let latest: LoadedContent | undefined;
let running: Promise<LoadedContent> | undefined;
const listeners = new Set<() => void>();

function update(me: Me, site: SiteSettings, force: boolean): Promise<LoadedContent> {
  running ??= updateContent(me.user.id, site, { current: latest, force })
    .then((c) => {
      latest = c;
      return c;
    })
    .finally(() => {
      running = undefined;
      listeners.forEach((l) => l());
    });
  listeners.forEach((l) => l());
  return running;
}

/** Forget the list in memory (on logout). */
export function resetContent(): void {
  latest = undefined;
}

export interface ContentState {
  site: SiteSettings | null;
  content: LoadedContent | null;
  /** Reading from GitHub in the background. */
  updating: boolean;
  /** Reading failed and there is nothing to show. */
  error: boolean;
  /** Reads everything again. */
  refresh: () => void;
  /** Brings the list up to date, reading only what changed (e.g. after the app's own commit). */
  update: () => void;
}

export function useContent(me: Me): ContentState {
  const [site, setSite] = useState<SiteSettings | null>(null);
  const [content, setContent] = useState<LoadedContent | null>(latest ?? null);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(false);

  const run = async (force: boolean) => {
    try {
      const s = site ?? (await loadSite());
      setSite(s);
      if (!latest) {
        const cached: ContentIndex | undefined = await cachedContent(me.user.id);
        if (cached) setContent((latest = { ...cached, stale: false }));
      }
      setContent(await update(me, s, force));
      setError(false);
    } catch {
      setError(true);
    }
  };

  useEffect(() => {
    const onChange = () => setUpdating(running !== undefined);
    listeners.add(onChange);
    onChange();
    void run(false);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  return { site, content, updating, error, refresh: () => void run(true), update: () => void run(false) };
}
