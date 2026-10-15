// SPDX-License-Identifier: MIT
// All Alasin cookies use the __Host- prefix: Secure, Path=/, no Domain, so they
// are bound to exactly this origin.

export const SESSION_COOKIE = "__Host-alasin_session";
export const OAUTH_COOKIE = "__Host-alasin_oauth";

export function readCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

export function serializeCookie(name: string, value: string, maxAgeSeconds: number): string {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error("cookie value must be base64url");
  return `${name}=${value}; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

export function clearCookie(name: string): string {
  return `${name}=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax`;
}
