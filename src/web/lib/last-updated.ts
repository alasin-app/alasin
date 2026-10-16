// SPDX-License-Identifier: MIT
//
// Who last changed each post or page, and when, from the git history: asked
// only for the rows on screen, 50 at a time, and kept for the session per
// file version (a new version means a new commit to look up).

import { useEffect, useState } from "preact/hooks";
import { api } from "./api";
import type { ContentItem } from "./content-index";

export interface LastUpdate {
  date: string;
  /** GitHub login, if the commit's author is linked to an account. */
  login?: string;
  id?: number;
  /** The commit's author name. */
  name: string;
}

const known = new Map<string, LastUpdate | null>();
const asking = new Set<string>();
const key = (i: ContentItem) => `${i.path}@${i.sha}`;

type Node = { committedDate: string; author: { name: string; user: { login: string; databaseId: number } | null } | null };

async function ask(items: ContentItem[]): Promise<void> {
  for (let n = 0; n < items.length; n += 50) {
    const batch = items.slice(n, n + 50);
    batch.forEach((i) => asking.add(key(i)));
    try {
      const res = await api<{ data?: { repository?: { ref?: { target?: Record<string, { nodes: Node[] }> } } } }>("/api/content/history", {
        method: "POST",
        body: { paths: batch.map((i) => i.path) },
      });
      const target = res.data?.repository?.ref?.target ?? {};
      batch.forEach((i, k) => {
        const node = target[`h${k}`]?.nodes[0];
        known.set(
          key(i),
          node
            ? { date: node.committedDate, name: node.author?.name ?? "", ...(node.author?.user ? { login: node.author.user.login, id: node.author.user.databaseId } : {}) }
            : null,
        );
      });
    } catch {
      // Shown without it; asked again next time.
    } finally {
      batch.forEach((i) => asking.delete(key(i)));
    }
  }
}

/** The last update of each shown item that is known so far, by path. */
export function useLastUpdated(items: ContentItem[]): Map<string, LastUpdate> {
  const [, setTick] = useState(0);
  const missing = items.filter((i) => !known.has(key(i)) && !asking.has(key(i)));
  const wanted = missing.map(key).join("|");
  useEffect(() => {
    if (!missing.length) return;
    let live = true;
    void ask(missing).then(() => live && setTick((t) => t + 1));
    return () => {
      live = false;
    };
  }, [wanted]);
  const out = new Map<string, LastUpdate>();
  for (const i of items) {
    const u = known.get(key(i));
    if (u) out.set(i.path, u);
  }
  return out;
}
