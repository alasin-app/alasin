import { describe, expect, it } from "vitest";
import { buildIndex, changedPaths, imagesIn, mediaUsage, plainText } from "../../src/web/lib/content-index";

const folders = { posts: "content/posts", pages: "content/pages", drafts: "drafts", archive: "archive", bin: "bin" };
const site = { folders, authorField: "author", media: { publicUrl: "https://media.example.com/", contentPrefix: "/img/", browse: [""], byMonth: true } };

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


describe("valueCounts", () => {
  it("counts each value once per item, most used first", async () => {
    const { valueCounts } = await import("../../src/web/lib/content-index");
    const items = [{ tags: ["a", "b", "a"] }, { tags: ["b"] }, { tags: [] }] as unknown as Parameters<typeof valueCounts>[0];
    expect(valueCounts(items, (i) => i.tags)).toEqual([
      { value: "b", count: 2 },
      { value: "a", count: 1 },
    ]);
  });
});

describe("media usage", () => {
  it("finds the images a file refers to, by content prefix or public URL", () => {
    const text = `---\nimage: /img/2026/10/01/cover.jpg\n---\n![](/img/2026/10/02/a%C3%A4.jpg) <img src="https://media.example.com/2025/01/01/b-960.webp">\n{{< figure src="/img/2026/10/03/c.PNG" >}} /img/notes.txt /other/x.jpg`;
    expect(imagesIn(text, site)).toEqual(["2026/10/01/cover.jpg", "2026/10/02/aä.jpg", "2025/01/01/b-960.webp", "2026/10/03/c.PNG"]);
  });

  it("counts an image as used through its variants and from any file, section pages included", () => {
    const index = buildIndex(
      {
        data: {
          repository: {
            ref: { target: { oid: "c".repeat(40) } },
            posts: { entries: [file("_index.md", "![](/img/2026/01/01/section.jpg)"), file("p.md", "---\ntitle: P\n---\n![](/img/2026/01/01/b-480.webp) /img/2026/01/01/route-66.jpg")] },
            pages: { entries: [] },
            drafts: null,
            archive: null,
            bin: null,
          },
        },
      },
      site,
    );
    const used = mediaUsage(index);
    expect(["section.jpg", "b.jpg", "route-66.jpg", "route.jpg", "orphan.jpg"].map((n) => used(`2026/01/01/${n}`))).toEqual([true, true, true, true, false]);
  });
});
