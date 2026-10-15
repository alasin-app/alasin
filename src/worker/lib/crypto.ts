// SPDX-License-Identifier: MIT
// AES-GCM encryption for the session cookie and tokens at rest, plus random IDs.

import { fromBase64, fromBase64Url, toBase64Url, utf8 } from "./encoding";

const keyCache = new Map<string, Promise<CryptoKey>>();

export class KeyConfigError extends Error {
  constructor(name: string) {
    super(`${name} must be 32 random bytes encoded as base64 (run \`npm run setup\` to generate it)`);
    this.name = "KeyConfigError";
  }
}

/** Imports a base64-encoded 256-bit secret as an AES-GCM key. */
export function importAesKey(secretName: string, base64: string | undefined): Promise<CryptoKey> {
  if (!base64) return Promise.reject(new KeyConfigError(secretName));
  const cacheKey = `${secretName}:${base64}`;
  let key = keyCache.get(cacheKey);
  if (!key) {
    let raw: Uint8Array;
    try {
      raw = fromBase64(base64);
    } catch {
      return Promise.reject(new KeyConfigError(secretName));
    }
    if (raw.length !== 32) return Promise.reject(new KeyConfigError(secretName));
    key = crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
    keyCache.set(cacheKey, key);
  }
  return key;
}

/**
 * Encrypts `plaintext` with AES-256-GCM. `context` is bound as additional
 * authenticated data, so a value encrypted for one purpose can't be replayed
 * as another. Output: base64url(iv || ciphertext+tag).
 */
export async function seal(key: CryptoKey, plaintext: string, context: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: utf8.encode(context) }, key, utf8.encode(plaintext)),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return toBase64Url(out);
}

/** Reverses `seal`. Returns null for anything tampered, truncated or encrypted for another context. */
export async function open(key: CryptoKey, sealed: string, context: string): Promise<string | null> {
  try {
    const bytes = fromBase64Url(sealed);
    if (bytes.length < 12 + 16) return null;
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.subarray(0, 12), additionalData: utf8.encode(context) },
      key,
      bytes.subarray(12),
    );
    return utf8.decode(new Uint8Array(pt));
  } catch {
    return null;
  }
}

/** `bytes` of CSPRNG output as base64url. */
export function randomToken(bytes = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Base64Url(input: string): Promise<string> {
  return toBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", utf8.encode(input))));
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const ab = utf8.encode(a);
  const bb = utf8.encode(b);
  if (ab.length !== bb.length) return false;
  return crypto.subtle.timingSafeEqual(ab, bb);
}
