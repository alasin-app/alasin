// SPDX-License-Identifier: MIT
// ULIDs identify drafts: 26 characters of Crockford base32, sortable by
// creation time, with 80 random bits.

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function isUlid(value: string): boolean {
  return ULID_PATTERN.test(value);
}

export function ulid(now = Date.now()): string {
  let time = "";
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[t % 32]! + time;
    t = Math.floor(t / 32);
  }
  const random = crypto.getRandomValues(new Uint8Array(16));
  let rest = "";
  for (let i = 0; i < 16; i++) rest += ALPHABET[random[i]! % 32];
  return time + rest;
}
