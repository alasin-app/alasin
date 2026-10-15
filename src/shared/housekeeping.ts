// SPDX-License-Identifier: MIT
//
// Housekeeping: secrets are rotated by hand, and Alasin reminds the operator
// when that's due. `npm run setup` records when each secret was last rotated
// in alasin.toml ([security]); `npm run deploy` and the app's account sheet
// show what is overdue.

import type { AlasinConfig } from "./config/schema";

export type HousekeepingItem = "session_keys" | "github_secrets";

export interface HousekeepingDue {
  item: HousekeepingItem;
  /** Last rotation date (YYYY-MM-DD), or null if none is recorded. */
  lastRotated: string | null;
  /** Days since the last rotation, or null if none is recorded. */
  ageDays: number | null;
}

const DAY = 86_400_000;

function ageInDays(date: string, now: number): number {
  return Math.floor((now - Date.parse(`${date}T00:00:00Z`)) / DAY);
}

/** Items whose rotation is overdue (or has never been recorded). */
export function housekeepingDue(config: AlasinConfig, now = Date.now()): HousekeepingDue[] {
  const s = config.security;
  const items: [HousekeepingItem, string | undefined][] = [
    ["session_keys", s.session_keys_rotated],
    ["github_secrets", s.github_secrets_rotated],
  ];
  const due: HousekeepingDue[] = [];
  for (const [item, last] of items) {
    if (!last) due.push({ item, lastRotated: null, ageDays: null });
    else if (ageInDays(last, now) >= s.rotation_reminder_days) due.push({ item, lastRotated: last, ageDays: ageInDays(last, now) });
  }
  return due;
}

/** Today's date as YYYY-MM-DD (UTC). */
export function today(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Operator instructions, for the command line. */
export const HOUSEKEEPING_HOWTO: Record<HousekeepingItem, { title: string; howTo: string }> = {
  session_keys: {
    title: "Session and token encryption keys",
    howTo: "npm run setup -- --rotate-keys   (everyone has to log in again)",
  },
  github_secrets: {
    title: "GitHub App client secret and private key",
    howTo:
      "On the GitHub App's settings page, generate a new client secret and private key, then run npm run setup -- --rotate-github and delete the old ones on GitHub",
  },
};
