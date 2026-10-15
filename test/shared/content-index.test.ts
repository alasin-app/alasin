import { describe, expect, it } from "vitest";
import { buildIndex, changedPaths, plainText } from "../../src/web/lib/content-index";

const folders = { posts: "content/posts", pages: "content/pages", drafts: "drafts", archive: "archive", bin: "bin" };
const site = { folders, authorField: "author" };

const file = (name: string, text: string, oid = "a".repeat(40)) => ({ name, type: "blob", object: { oid, text, isBinary: false, isTruncated: false } });
const dir = (name: string, entries: unknown[]) => ({ name, type: "tree", object: { entries } });
const post = (title: string, extra = "") => `---\ntitle: "${title}"\ndate: 2025-06-15T10:00:00+03:00\ncategories: ["travel"]\ntags: [a, b]\nauthor: "Jane"\n${extra}---\n\nHello **world** with a [link](https://x) and ![alt text](/img/a.jpg).\n\n{{< youtube abc >}}\n`;

const response = {
  data: {
    repository: {
      ref: { target: { oid: "c".repeat(40) } },
      posts: { entries: [file("_index.md", "---\ntitle: Posts\n---\n"), dir("2025", [file("trip.md", post("Trip")), dir("bundle", [file("index.md", post("Bundle")), file("photo.jpg", "x")])]), file("hidden.md", post("Hidden", "draft: true\n"))] },
      pages: { entries: [file("about.md", "---\ntitle: About\n---\nAbout us.\n")] },
      drafts: { entries: [dir("posts", [file("01JA2B3C4D5E6F7G8H9JKMNPQR.md", post("New one", 'draftId: "01JA2B3C4D5E6F7G8H9JKMNPQR"\n'))])] },
      archive: { entries: [dir("content", [dir("posts", [dir("2020", [file("old.md", post("Old"))])])])] },
      bin: { entries: [dir("drafts", [dir("posts", [file("01JA2B3C4D5E6F7G8H9JKMNPQS.md", post("Deleted draft"))])]), dir("content", [dir("pages", [file("gone.md", "---\ntitle: Gone\n---\n")])])] },
    },
  },
};

describe("content index", () => {
  const index = buildIndex(response, site);
  const byTitle = (t: string) => index.items.find((i) => i.title === t)!;

  it("lists posts and pages with their state from where they are", () => {
    expect(index.commit).toBe("c".repeat(40));
    expect(index.items.map((i) => [i.title, i.kind, i.state])).toEqual([
      ["Trip", "post", "published"],
      ["Bundle", "post", "published"],
      ["Hidden", "post", "draft"],
      ["About", "page", "published"],
      ["New one", "post", "draft"],
      ["Old", "post", "archived"],
      ["Deleted draft", "post", "bin"],
      ["Gone", "page", "bin"],
    ]);
  });

  it("keeps paths, front matter fields and where Bin items came from", () => {
    expect(byTitle("Trip")).toMatchObject({ path: "content/posts/2025/trip.md", categories: ["travel"], tags: ["a", "b"], date: "2025-06-15T10:00:00+03:00", author: "Jane" });
    expect(byTitle("Trip").time).toBe(Date.parse("2025-06-15T07:00:00Z"));
    expect(byTitle("New one").draftId).toBe("01JA2B3C4D5E6F7G8H9JKMNPQR");
    expect(byTitle("Old").path).toBe("archive/content/posts/2020/old.md");
    expect(byTitle("Deleted draft").origin).toEqual({ path: "drafts/posts/01JA2B3C4D5E6F7G8H9JKMNPQS.md", state: "draft" });
    expect(byTitle("Gone").origin).toEqual({ path: "content/pages/gone.md", state: "published" });
  });

  it("makes searchable plain text", () => {
    expect(byTitle("Trip").text).toBe("Hello world with a link and alt text.");
    expect(plainText("## Heading\n\n> quote\n- item\n<b>bold</b>\n```\ncode\n```\n")).toBe("Heading quote item bold");
  });

  it("reports GitHub errors", () => {
    expect(() => buildIndex({ errors: [{ message: "Bad credentials" }] }, site)).toThrow("Bad credentials");
  });

  it("works out which files to read again after changes", () => {
    const files = [
      { filename: "content/posts/a.md", status: "modified" },
      { filename: "content/posts/b.md", status: "removed" },
      { filename: "archive/content/posts/c.md", status: "renamed", previous_filename: "content/posts/c.md" },
      { filename: "static/x.jpg", status: "added" },
      { filename: "README.md", status: "modified" },
    ];
    expect(changedPaths(files, folders)).toEqual({
      remove: ["content/posts/b.md", "content/posts/c.md"],
      read: ["content/posts/a.md", "archive/content/posts/c.md"],
    });
  });
});

