// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { addImagesAt, findGalleries, findShortcodes, galleryText, setImageTitleAt, standaloneImage, withImageTitle } from "../../src/web/editor/blocks";

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
    expect(standaloneImage("![](/img/c.jpg)")).toEqual({ alt: "", url: "/img/c.jpg", title: "" });
    expect(standaloneImage('  ![A](/x.png "t")  ')).toEqual({ alt: "A", url: "/x.png", title: "t" });
    expect(standaloneImage("Text ![](/img/c.jpg)")).toBeNull();
  });

  it("reads picture texts, escaped quotes included", () => {
    const [g] = findGalleries(TEXT, "gallery");
    expect(g!.images.map((i) => i.title)).toEqual(["", "Caption b"]);
    expect(standaloneImage('![](/x.jpg "Say \\"hi\\"")')!.title).toBe('Say "hi"');
  });

  it("sets, changes and removes a picture's text, keeping alt and address as written", () => {
    expect(withImageTitle("![](/x.jpg)", "Harbour at dusk")).toBe('![](/x.jpg "Harbour at dusk")');
    expect(withImageTitle('![Alt](/x.jpg "Old")', "New")).toBe('![Alt](/x.jpg "New")');
    expect(withImageTitle('![Alt](/x.jpg "Old")', "  ")).toBe("![Alt](/x.jpg)");
    expect(withImageTitle("![](/x.jpg)", 'A "quote"\nand a line')).toBe('![](/x.jpg "A \\"quote\\" and a line")');
    expect(standaloneImage(withImageTitle("![](/x.jpg)", 'a\\b "c"'))!.title).toBe('a\\b "c"');
  });

  it("sets the text of one image in a gallery, changing only its line", () => {
    const [g] = findGalleries(TEXT, "gallery");
    const change = setImageTitleAt(TEXT, "gallery", { pos: g!.from, index: 0 }, "First");
    const next = TEXT.slice(0, change!.from) + change!.insert + TEXT.slice(change!.to);
    expect(next).toBe(TEXT.replace("![](/img/a.jpg)", '![](/img/a.jpg "First")'));
    expect(setImageTitleAt(TEXT, "gallery", { pos: g!.from, index: 5 }, "x")).toBeNull();
  });

  it("sets the text of a single image, but not of one inside a gallery by its line", () => {
    const pos = TEXT.indexOf("![](/img/c.jpg)");
    const change = setImageTitleAt(TEXT, "gallery", { pos, index: null }, "C");
    expect(change).toEqual({ from: pos, to: pos + "![](/img/c.jpg)".length, insert: '![](/img/c.jpg "C")' });
    expect(setImageTitleAt(TEXT, "gallery", { pos: TEXT.indexOf("![](/img/a.jpg)"), index: null }, "x")).toBeNull();
    expect(setImageTitleAt(TEXT, "gallery", { pos: pos + 1, index: null }, "x")).toBeNull();
  });

  it("adds photos to the end of a gallery", () => {
    const [g] = findGalleries(TEXT, "gallery");
    const change = addImagesAt(TEXT, "gallery", g!.from, ["![](/img/d.jpg)"]);
    expect(change!.insert).toBe('{{< gallery caption="Day one" >}}\n\n![](/img/a.jpg)\n\n![Alt b](/img/b.jpg "Caption b")\n\n![](/img/d.jpg)\n\n{{< /gallery >}}');
    expect([change!.from, change!.to]).toEqual([g!.from, g!.to]);
  });

  it("makes a single image a gallery when photos are added to it", () => {
    const pos = TEXT.indexOf("![](/img/c.jpg)");
    const change = addImagesAt(TEXT, "gallery", pos, ["![](/img/d.jpg)", "![](/img/e.jpg)"]);
    expect(change).toEqual({
      from: pos,
      to: pos + "![](/img/c.jpg)".length,
      insert: "{{< gallery >}}\n\n![](/img/c.jpg)\n\n![](/img/d.jpg)\n\n![](/img/e.jpg)\n\n{{< /gallery >}}",
    });
    expect(addImagesAt("Just text", "gallery", 0, ["![](/img/d.jpg)"])).toBeNull();
  });
});
