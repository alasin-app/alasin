// SPDX-License-Identifier: MIT
// URL answers in `npm run setup`: a bare hostname such as `alasin.example.com`
// is accepted and gets `https://`.

/** Adds `https://` when no scheme is given and trims whitespace. */
export function normalizeUrl(input: string): string {
  const v = input.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
}

/** Returns an error message, or null if `input` is an acceptable https URL. */
export function urlProblem(input: string, opts: { originOnly: boolean }): string | null {
  let u: URL;
  try {
    u = new URL(normalizeUrl(input));
  } catch {
    return "not a valid address; enter a hostname like alasin.example.com or a full https:// URL";
  }
  if (u.protocol !== "https:") return "use https://";
  if (!u.hostname.includes(".")) return "enter a full hostname, e.g. alasin.example.com";
  if (opts.originOnly && (u.pathname !== "/" || u.search || u.hash)) {
    return "only the hostname, without a path (e.g. alasin.example.com)";
  }
  return null;
}
