// SPDX-License-Identifier: MIT
//
// Full names of the allowed users, from their GitHub profiles (looked up by
// numeric ID), so the lists and the editor show each author's current name.
// Read on every request and never kept: a name changed on GitHub shows at once.

/** The profile name of each user ID, null if they haven't set one (missing if GitHub didn't answer). */
export async function profileNames(token: string, ids: number[]): Promise<Map<number, string | null>> {
  const out = new Map<number, string | null>();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const res = await fetch(`https://api.github.com/user/${id}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "Alasin" },
        });
        if (!res.ok) return;
        out.set(id, ((await res.json()) as { name?: string | null }).name?.trim() || null);
      } catch {
        // Without the name the user is shown by login.
      }
    }),
  );
  return out;
}
