// SPDX-License-Identifier: MIT
// The skeleton Hugo site in templates/site/, which create-site commits to a
// new site repository. A few plain configuration files hold placeholders
// (`__NAME__`, never Hugo's `{{ }}`), filled in from the answers.
//
// No file access here, so tests can use it.

/** The placeholders and what they're filled with. */
export interface SkeletonValues {
  /** Production site address, without a trailing slash: https://www.example.com */
  SITE_URL: string;
  SITE_TITLE: string;
  /** Hugo's locale, e.g. en or fi. */
  LANGUAGE: string;
  /** The media bucket's public URL, ending in "/". */
  MEDIA_URL: string;
  /** The site Worker's name. */
  SITE_WORKER: string;
  /** The Hugo module path of the site, e.g. github.com/owner/repo. */
  MODULE_PATH: string;
}

/** The files that hold placeholders (relative to templates/site/). Other files are copied as they are. */
export const PLACEHOLDER_FILES = ["hugo.toml", "wrangler.jsonc", "go.mod", "content/_index.md"];

const PLACEHOLDER = /__([A-Z_]+)__/g;

/** Fills every placeholder; throws on one without a value, so nothing half-filled is committed. */
export function fillPlaceholders(text: string, values: SkeletonValues): string {
  return text.replace(PLACEHOLDER, (match, name: string) => {
    const value = (values as unknown as Record<string, string | undefined>)[name];
    if (value === undefined) throw new Error(`No value for ${match}`);
    // TOML and JSON strings: the values are plain, but quotes and backslashes must not break the file.
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  });
}

/** Placeholders still in a text. */
export const unfilled = (text: string): string[] => [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[0]))];
