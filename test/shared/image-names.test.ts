// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { baseNameFromUpload, extensionFor, uniqueBaseName } from "../../src/shared/image-names";

describe("image names", () => {
  it("keeps the original file name, lower-cased", () => {
    expect(baseNameFromUpload("IMG_3438.JPG")).toBe("img_3438");
    expect(baseNameFromUpload("img_3438.jpeg")).toBe("img_3438");
    expect(baseNameFromUpload("DSC01234.HEIC")).toBe("dsc01234");
  });

  it("makes names URL-safe", () => {
    expect(baseNameFromUpload("Kesä ilta  Äänekoskella (2).png")).toBe("kesa-ilta-aanekoskella-2");
    expect(baseNameFromUpload("Straße & Grün.jpg")).toBe("strasse-grun");
    expect(baseNameFromUpload("photo.final.v2.jpg")).toBe("photo-final-v2");
    expect(baseNameFromUpload("---weird___.jpg")).toBe("weird");
  });

  it("ignores directories and path tricks in the client's name", () => {
    expect(baseNameFromUpload("../../etc/passwd")).toBe("passwd");
    expect(baseNameFromUpload("C:\\Users\\me\\IMG_1.JPG")).toBe("img_1");
    expect(baseNameFromUpload("..")).toBe("image");
    expect(baseNameFromUpload(".jpg")).toBe("jpg");
  });

  it("falls back to 'image' and limits the length", () => {
    expect(baseNameFromUpload("")).toBe("image");
    expect(baseNameFromUpload("😀.jpg")).toBe("image");
    expect(baseNameFromUpload(`${"a".repeat(200)}.jpg`)).toHaveLength(80);
  });

  it("chooses the extension from the detected type", () => {
    expect(extensionFor("image/jpeg")).toBe("jpg");
    expect(extensionFor("image/webp")).toBe("webp");
  });

  it("adds a counter only when the name is taken", async () => {
    const taken = new Set(["img_3438", "img_3438-2"]);
    expect(await uniqueBaseName("img_9999", async (c) => taken.has(c))).toBe("img_9999");
    expect(await uniqueBaseName("img_3438", async (c) => taken.has(c))).toBe("img_3438-3");
  });
});
