import { describe, expect, it } from "vitest";
import { categoryTree } from "../../src/shared/categories";

const view = (list: ReturnType<typeof categoryTree>) => list.map((c) => `${"  ".repeat(c.depth)}${c.title}`);

describe("categoryTree", () => {
  it("puts children under their parent, siblings by title", () => {
    const tree = categoryTree([
      { slug: "summer-2016", title: "Summer 2016", parent: "holidays" },
      { slug: "dogs", title: "Dogs" },
      { slug: "travel", title: "Travel" },
      { slug: "holidays", title: "Holidays", parent: "travel" },
      { slug: "summer-2015", title: "Summer 2015", parent: "holidays" },
      { slug: "rex", title: "Rex", parent: "dogs" },
      { slug: "other", title: "Other trips", parent: "travel" },
    ]);
    expect(view(tree)).toEqual(["Dogs", "  Rex", "Travel", "  Holidays", "    Summer 2015", "    Summer 2016", "  Other trips"]);
    expect(tree.find((c) => c.slug === "summer-2015")!.path).toEqual(["Travel", "Holidays", "Summer 2015"]);
  });

  it("makes categories with a missing parent or a loop of parents top-level", () => {
    const tree = categoryTree([
      { slug: "a", title: "A", parent: "b" },
      { slug: "b", title: "B", parent: "a" },
      { slug: "c", title: "C", parent: "gone" },
      { slug: "d", title: "D", parent: "d" },
    ]);
    expect(tree.map((c) => c.depth)).toEqual([0, 0, 0, 0]);
    expect(tree).toHaveLength(4);
  });
});

describe("withoutCategory", () => {
  it("takes one category out, changing only that line", async () => {
    const { withoutCategory } = await import("../../src/shared/categories");
    const text = `---\ntitle: 'Trip'\n# kept\ncategories: ["travel", "summer-2015"]\ntags: [a]\n---\n\nText.\n`;
    expect(withoutCategory(text, "summer-2015")).toBe(text.replace('categories: ["travel", "summer-2015"]', 'categories: ["travel"]'));
    expect(withoutCategory(text.replace('["travel", "summer-2015"]', '["travel"]'), "travel")).toBe(`---\ntitle: 'Trip'\n# kept\ntags: [a]\n---\n\nText.\n`);
    expect(withoutCategory(text, "dogs")).toBeNull();
    const toml = `+++\ntitle = "T"\ncategories = [\n  "a",\n  "b",\n]\n+++\nBody\n`;
    expect(withoutCategory(toml, "a")).toBe(`+++\ntitle = "T"\ncategories = [ "b" ]\n+++\nBody\n`);
  });
});
