// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { newDraft, parseDraft, serializeDraft } from "../../src/web/lib/draft-model";
import type { SiteSettings } from "../../src/web/lib/site-types";

const site = { coverField: "image", frontMatterFormat: "yaml", authorField: "author", author: "Octo" } as unknown as SiteSettings;
const ID = "01JA2B3C4D5E6F7G8H9JKMNPQR";

describe("draft model", () => {
  it("writes an unchanged draft back byte for byte, whatever its style", () => {
    const texts = [
      `---\ntitle:   'Single quotes'   # a comment\ndraftId: ${ID}\ncategories:\n  - a\n  - b\n---\nNo blank line after front matter.\n\n\n`,
      `+++\ntitle = "TOML"\ndraftId = "${ID}"\n+++\n\nBody\n`,
      `---\ntitle: "x"\ndraftId: "${ID}"\n---\n\nNo trailing newline`,
    ];
    for (const text of texts) {
      const doc = parseDraft(text, site)!;
      const out = serializeDraft(doc, site);
      expect(out.replace(/\n$/, "")).toBe(text.replace(/\n$/, ""));
    }
  });

  it("rewrites front matter only when a form field changes, keeping unknown fields", () => {
    const text = `---\ntitle: 'Old'\ncustom: 1\ndraftId: "${ID}"\n---\n\nBody\n`;
    const doc = parseDraft(text, site)!;
    expect(serializeDraft({ ...doc, form: { ...doc.form, body: "New body\n" } }, site)).toBe(
      `---\ntitle: 'Old'\ncustom: 1\ndraftId: "${ID}"\n---\n\nNew body\n`,
    );
    const changed = serializeDraft({ ...doc, form: { ...doc.form, title: "New" } }, site);
    expect(changed).toContain('title: "New"');
    expect(changed).toContain("custom: 1");
    expect(changed).toContain(`draftId: "${ID}"`);
  });

  it("creates new drafts with a UTC date, draft: true and the author", () => {
    const doc = newDraft(ID, site, new Date("2026-10-15T11:05:30Z"));
    doc.form.title = "Hello";
    doc.form.body = "Text";
    const out = serializeDraft(doc, site);
    expect(out).toBe(`---\ntitle: "Hello"\ndate: 2026-10-15T11:05:30Z\nslug: ""\ndraft: true\nauthor: "Octo"\ndraftId: "${ID}"\n---\n\nText\n`);
  });
});
