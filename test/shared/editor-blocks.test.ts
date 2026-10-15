// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { findGalleries, findShortcodes, galleryText, standaloneImage } from "../../src/web/editor/blocks";

const TEXT = `Intro

{{< gallery caption="Day one" >}}

![](/img/a.jpg)

![Alt b](/img/b.jpg "Caption b")

{{< /gallery >}}

{{< youtube abc123 >}}

![](/img/c.jpg)
`;

describe("editor blocks", () => {
  it("finds galleries with their images and keeps the opening tag as written", () => {
    const [g] = findGalleries(TEXT, "gallery");
    expect(g!.open).toBe('{{< gallery caption="Day one" >}}');
    expect(g!.close).toBe("{{< /gallery >}}");
    expect(g!.images.map((i) => i.url)).toEqual(["/img/a.jpg", "/img/b.jpg"]);
    expect(g!.images[1]!.markdown).toBe('![Alt b](/img/b.jpg "Caption b")');
    expect(g!.editable).toBe(true);
    expect(TEXT.slice(g!.from, g!.to)).toBe(galleryText(g!, g!.images));
  });

  it("rewrites a reordered gallery, changing only the order", () => {
    const [g] = findGalleries(TEXT, "gallery");
    const reordered = TEXT.slice(0, g!.from) + galleryText(g!, [g!.images[1]!, g!.images[0]!]) + TEXT.slice(g!.to);
    expect(reordered).toContain('{{< gallery caption="Day one" >}}\n\n![Alt b](/img/b.jpg "Caption b")\n\n![](/img/a.jpg)\n\n{{< /gallery >}}');
    expect(reordered.replace(/!\[[^\n]*/g, "")).toBe(TEXT.replace(/!\[[^\n]*/g, ""));
  });

  it("removes an empty gallery entirely", () => {
    const [g] = findGalleries(TEXT, "gallery");
    expect(galleryText(g!, [])).toBe("");
  });

  it("marks galleries with other content as not editable", () => {
    const [g] = findGalleries("{{< gallery >}}\n\n![](/a.jpg)\n\nSome text\n\n{{< /gallery >}}", "gallery");
    expect(g!.editable).toBe(false);
  });

  it("supports a differently named gallery shortcode", () => {
    expect(findGalleries("{{< photos >}}\n![](/a.jpg)\n{{< /photos >}}", "photos")).toHaveLength(1);
    expect(findGalleries("{{< photos >}}\n![](/a.jpg)\n{{< /photos >}}", "gallery")).toHaveLength(0);
  });

  it("finds other shortcodes as protected lines", () => {
    expect(findShortcodes(TEXT, "gallery").map((s) => s.text)).toEqual(["{{< youtube abc123 >}}"]);
    expect(findShortcodes("{{% notice %}}\nx\n{{% /notice %}}", "gallery").map((s) => s.name)).toEqual(["notice", "notice"]);
  });

  it("recognises a line that is just an image", () => {
    expect(standaloneImage("![](/img/c.jpg)")).toEqual({ alt: "", url: "/img/c.jpg" });
    expect(standaloneImage('  ![A](/x.png "t")  ')).toEqual({ alt: "A", url: "/x.png" });
    expect(standaloneImage("Text ![](/img/c.jpg)")).toBeNull();
  });
});
