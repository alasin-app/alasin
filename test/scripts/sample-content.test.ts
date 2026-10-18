// SPDX-License-Identifier: MIT
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { parseFields, splitFrontMatter } from "../../src/shared/frontmatter";
import { isUlid } from "../../src/shared/ulid";
import { creditsPage, jpegSize, ORPHAN, type SampleFile, sampleUploads } from "../../scripts/lib/sample-content";
import { fillPlaceholders, unfilled } from "../../scripts/lib/skeleton";

const raw = import.meta.glob("../../templates/sample/repo/**/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const files: SampleFile[] = Object.entries(raw).map(([p, text]) => ({ path: p.replace("../../templates/sample/repo/", ""), text }));
const images = Object.keys(import.meta.glob("../../templates/sample/images/*.jpg")).map((p) => p.slice(p.lastIndexOf("/") + 1));
const credits = Object.values(import.meta.glob("../../templates/sample/CREDITS.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>)[0]!;

const fields = (f: SampleFile) => {
  const split = splitFrontMatter(f.text)!;
  return parseFields(split.format, split.raw);
};
const uploads = sampleUploads(files, { contentPrefix: "/img/", widths: [480, 960, 1600], variantName: "{name}-{width}.{ext}", variantFormat: "webp", images, width: () => 1280 });

const values = { SITE_TITLE: "Example", AUTHOR_NAME: "Jane Doe", AUTHOR_ID: "jane-doe", SECOND_AUTHOR_NAME: "John Roe", SECOND_AUTHOR_ID: "john-roe" };

describe("dev sample content", () => {
  it("has every part #251 asks for", () => {
    const at = (prefix: string) => files.filter((f) => f.path.startsWith(prefix));
    expect(at("content/posts/")).toHaveLength(5);
    expect(files.some((f) => f.path === "content/_index.md")).toBe(true);
    expect(at("content/pages/about/").length).toBeGreaterThanOrEqual(3); // a page with sub-pages
    expect(at("drafts/posts/")).toHaveLength(1);
    expect(at("drafts/pages/")).toHaveLength(1);
    expect(at("archive/content/posts/")).toHaveLength(1);
    expect(at("bin/content/posts/")).toHaveLength(1);
    // Two authors.
    const authors = new Set(at("content/posts/").map((f) => fields(f).get("author_id")));
    expect(authors).toEqual(new Set(["__AUTHOR_ID__", "__SECOND_AUTHOR_ID__"]));
  });

  it("has drafts as Alasin saves them", () => {
    for (const f of files.filter((x) => x.path.startsWith("drafts/"))) {
      const id = f.path.slice(f.path.lastIndexOf("/") + 1, -3);
      expect(isUlid(id)).toBe(true);
      expect(fields(f).get("draftId")).toBe(id);
      expect(fields(f).has("draft")).toBe(false);
    }
  });

  it("uses only categories that have term pages", () => {
    const terms = new Set(files.filter((f) => /^content\/categories\/[^/]+\/_index\.md$/.test(f.path)).map((f) => fields(f).get("title")));
    for (const f of files) {
      const cats = fields(f).get("categories");
      for (const c of Array.isArray(cats) ? cats : []) expect(terms, `${f.path}: ${String(c)}`).toContain(c);
    }
  });

  it("fills to a text with no placeholders left", () => {
    for (const f of [...files, creditsPage(credits)]) expect(unfilled(fillPlaceholders(f.text, values)), f.path).toEqual([]);
  });

  it("uploads every photo the content uses, with the sizes Alasin makes, plus an orphan", () => {
    expect(new Set(uploads.map((u) => u.image))).toEqual(new Set(images));
    const cover = uploads.find((u) => u.key === "2026/06/14/apple-blossoms.jpg")!;
    expect(cover).toEqual({
      bucket: "media",
      key: "2026/06/14/apple-blossoms.jpg",
      image: "apple-blossoms.jpg",
      variants: [
        { key: "2026/06/14/apple-blossoms-480.webp", width: 480 },
        { key: "2026/06/14/apple-blossoms-960.webp", width: 960 },
      ],
    });
    expect(uploads.filter((u) => u.bucket === "drafts").map((u) => u.key)).toEqual(["01M3QSRT00A684TDARGYVPZF45/shallow-water.jpg"]);
    // Each key once, even when several files use it (the home page reuses a post's photo).
    expect(new Set(uploads.map((u) => `${u.bucket}:${u.key}`)).size).toBe(uploads.length);
    // The orphan isn't used by any file.
    expect(files.some((f) => f.text.includes(ORPHAN.key))).toBe(false);
    expect(uploads.some((u) => u.key === ORPHAN.key)).toBe(true);
  });

  it("refuses a photo there's no sample image for", () => {
    const bad = [{ path: "content/posts/x.md", text: "![](/img/2026/01/01/missing.jpg)" }];
    expect(() => sampleUploads(bad, { contentPrefix: "/img/", widths: [480], variantName: "{name}-{width}.{ext}", variantFormat: "webp", images, width: () => 1280 })).toThrow("No sample image missing.jpg");
  });

  it("credits every photo on the site's credits page", () => {
    const page = creditsPage(credits);
    expect(page.path).toBe("content/pages/credits.md");
    for (const image of images) expect(page.text).toContain(`\`${image}\``);
  });
});

describe("jpegSize", () => {
  it("reads the frame header, past other segments", () => {
    const app0 = [0xff, 0xe0, 0x00, 0x04, 0x00, 0x00];
    const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0xd0, 0x05, 0x00];
    expect(jpegSize(new Uint8Array([0xff, 0xd8, ...app0, ...sof0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toEqual({ width: 1280, height: 720 });
    expect(jpegSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });
});
