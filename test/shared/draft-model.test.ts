// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { newDraft, parseDraft, prepareSave, serializeDraft } from "../../src/web/lib/draft-model";
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

  it("changes only the author line when the author changes, and removes an empty one", () => {
    const text = `---\ntitle: "Post"\ndraft: true\nauthor: "Octo"\ndraftId: "${ID}"\n---\n\nBody\n`;
    const doc = parseDraft(text, site)!;
    expect(doc.form.author).toBe("Octo");
    expect(serializeDraft({ ...doc, form: { ...doc.form, author: "Mona Lisa" } }, site)).toBe(
      `---\ntitle: "Post"\ndraft: true\nauthor: "Mona Lisa"\ndraftId: "${ID}"\n---\n\nBody\n`,
    );
    expect(serializeDraft({ ...doc, form: { ...doc.form, author: " " } }, site)).not.toContain("author");
  });

  it("leaves an author line alone when the site has no author field", () => {
    const plain = { ...site, authorField: null } as SiteSettings;
    const text = `---\ntitle: "Post"\ndraft: true\nauthor: "Octo"\ndraftId: "${ID}"\n---\n\nBody\n`;
    const doc = parseDraft(text, plain)!;
    expect(doc.form.author).toBe("");
    expect(serializeDraft({ ...doc, form: { ...doc.form, title: "New" } }, plain)).toContain('author: "Octo"');
    expect(newDraft(ID, plain).form.author).toBe("");
  });

  describe("author_id", () => {
    const withId = {
      ...site,
      authorIdField: "author_id",
      login: "octocat",
      users: [{ login: "octocat", id: 1, name: "Octo Cat" }],
    } as unknown as SiteSettings;

    it("gives a new draft the user's name and GitHub login", () => {
      const doc = newDraft(ID, withId, new Date("2026-10-15T11:05:30Z"));
      expect(doc.form).toMatchObject({ author: "Octo", authorId: "octocat" });
      doc.form.title = "Hello";
      expect(serializeDraft(doc, withId)).toContain(`author: "Octo"\nauthor_id: "octocat"\ndraftId: "${ID}"`);
    });

    it("reads author_id, and changes only its line when another author is chosen", () => {
      const text = `---\ntitle: "Post"\ndraft: true\nauthor: "Octo Cat"\nauthor_id: "octocat"\ndraftId: "${ID}"\n---\n\nBody\n`;
      const doc = parseDraft(text, withId)!;
      expect(doc.form.authorId).toBe("octocat");
      expect(serializeDraft({ ...doc, form: { ...doc.form, author: "Guest", authorId: "" } }, withId)).toBe(
        `---\ntitle: "Post"\ndraft: true\nauthor: "Guest"\ndraftId: "${ID}"\n---\n\nBody\n`,
      );
    });

    it("writes the user's current name to author on saving, so the file keeps the last known name", () => {
      const text = `---\ntitle: "Post"\ndraft: true\nauthor: "Old Name"\nauthor_id: "octocat"\ndraftId: "${ID}"\n---\n\nBody\n`;
      const saved = prepareSave(parseDraft(text, withId)!, withId, { rich: true, saved: text });
      expect(saved.author).toBe("Octo Cat");
      expect(saved.content).toBe(text.replace("Old Name", "Octo Cat"));
      // Someone who is no longer a user: their name is kept.
      const former = text.replace('author_id: "octocat"', 'author_id: "former"');
      expect(prepareSave(parseDraft(former, withId)!, withId, { rich: true, saved: former }).content).toBe(former);
    });
  });
});
