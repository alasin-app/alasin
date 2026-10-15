// SPDX-License-Identifier: MIT
//
// Full names of the allowed users, from their GitHub profiles (looked up by
// numeric ID), so the author field and git author names can be matched to
// users without listing names in the configuration. Kept in KV for a day.

const TTL_SECONDS = 24 * 60 * 60;

/** The profile name of each user ID, null if they haven't set one. */
export async function profileNames(kv: KVNamespace, token: string, ids: number[]): Promise<Map<number, string | null>> {
  const out = new Map<number, string | null>();
  await Promise.all(
    ids.map(async (id) => {
      const key = `profile-name:${id}`;
      const kept = await kv.get(key);
      if (kept !== null) {
        out.set(id, kept || null);
        return;
      }
      try {
        const res = await fetch(`https://api.github.com/user/${id}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "Alasin" },
        });
        if (!res.ok) return; // Not kept: asked again next time.
        const name = ((await res.json()) as { name?: string | null }).name?.trim() || "";
        out.set(id, name || null);
        await kv.put(key, name, { expirationTtl: TTL_SECONDS });
      } catch {
        // Without the name the user is matched by login only.
      }
    }),
  );
  return out;
}
