// SPDX-License-Identifier: MIT
// Per-deployment UI settings, injected by the Worker as <meta> tags.

function meta(name: string): string {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? "";
}

export const settings = {
  get appName() {
    return meta("alasin:name") || "Alasin";
  },
  get accent() {
    return /^#[0-9a-fA-F]{6}$/.test(meta("alasin:accent")) ? meta("alasin:accent") : "#007AFF";
  },
  get environment() {
    return meta("alasin:environment");
  },
  get language() {
    return meta("alasin:language");
  },
  /** One-time nonce for runtime <style> elements (the editor's), from the page's CSP. */
  get styleNonce() {
    return meta("alasin:style-nonce");
  },
};
