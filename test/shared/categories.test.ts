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
