// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { bundleImagePath, bundleImageType } from "../../src/shared/bundle-files";
import { shortcodeSrc } from "../../src/web/editor/blocks";

const BUNDLE = "content/posts/2026/solar/index.md";

describe("bundleImagePath", () => {
  it("finds a file next to a bundle's index.md", () => {
    expect(bundleImagePath("diagram.svg", BUNDLE, "content")).toBe("content/posts/2026/solar/diagram.svg");
    expect(bundleImagePath("./img/photo.JPG", BUNDLE, "content")).toBe("content/posts/2026/solar/img/photo.JPG");
    expect(bundleImagePath("diagram.svg", "index.md", "")).toBe("diagram.svg");
  });

  it("finds a file in another page's bundle by its content path", () => {
    expect(bundleImagePath("/pages/guide/logo.png", BUNDLE, "content")).toBe("content/pages/guide/logo.png");
    expect(bundleImagePath("/pages/guide/logo.png", "content/posts/a.md", "content")).toBe("content/pages/guide/logo.png");
    expect(bundleImagePath("/pages/logo.png", "pages/a.md", "")).toBe("pages/logo.png");
  });

  it("leaves out URLs, other files, names outside bundles and paths leaving the folder", () => {
    expect(bundleImagePath("https://example.com/a.png", BUNDLE, "content")).toBeNull();
    expect(bundleImagePath("//example.com/a.png", BUNDLE, "content")).toBeNull();
    expect(bundleImagePath("notes.txt", BUNDLE, "content")).toBeNull();
    expect(bundleImagePath("diagram.svg", "content/posts/a.md", "content")).toBeNull();
    expect(bundleImagePath("../other/a.png", BUNDLE, "content")).toBeNull();
    expect(bundleImagePath("/../secret.png", BUNDLE, "content")).toBeNull();
  });

  it("knows image types by extension", () => {
    expect(bundleImageType("a/b.svg")).toBe("image/svg+xml");
    expect(bundleImageType("a/b.JPEG")).toBe("image/jpeg");
    expect(bundleImageType("a/b.md")).toBeUndefined();
  });
});

describe("shortcodeSrc", () => {
  it("reads the src parameter however it's quoted", () => {
    expect(shortcodeSrc('{{< svg src="diagram.svg" caption="A drawing" >}}')).toBe("diagram.svg");
    expect(shortcodeSrc("{{< figure src='a.png' >}}")).toBe("a.png");
    expect(shortcodeSrc("{{< figure src=a.png >}}")).toBe("a.png");
    expect(shortcodeSrc('{{< youtube id="abc" >}}')).toBeNull();
    expect(shortcodeSrc('{{< x datasrc="a.png" >}}')).toBeNull();
  });
});
