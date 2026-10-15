// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { exifHasGps, findExif, hasGpsLocation, sniffImageType } from "../../src/shared/image-files";
import { gif, jpeg, png, svg, tiff, webp } from "../images";

describe("image file checks", () => {
  it("recognises images by content", () => {
    expect(sniffImageType(jpeg())).toBe("image/jpeg");
    expect(sniffImageType(png())).toBe("image/png");
    expect(sniffImageType(webp())).toBe("image/webp");
    expect(sniffImageType(gif())).toBe("image/gif");
    expect(sniffImageType(svg())).toBeNull();
    expect(sniffImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });

  it("finds GPS data in JPEG, PNG and WebP EXIF", () => {
    expect(hasGpsLocation(jpeg({ gps: true }), "image/jpeg")).toBe(true);
    expect(hasGpsLocation(png({ gps: true }), "image/png")).toBe(true);
    expect(hasGpsLocation(webp({ gps: true }), "image/webp")).toBe(true);
    expect(hasGpsLocation(webp({ gps: true, exifPrefix: true }), "image/webp")).toBe(true);
    expect(hasGpsLocation(jpeg({ gps: true, bigEndian: true }), "image/jpeg")).toBe(true);
  });

  it("accepts EXIF without GPS", () => {
    expect(hasGpsLocation(jpeg({ exif: true }), "image/jpeg")).toBe(false);
    expect(findExif(jpeg({ exif: true }), "image/jpeg")).not.toBeNull();
    expect(hasGpsLocation(jpeg(), "image/jpeg")).toBe(false);
    expect(hasGpsLocation(png(), "image/png")).toBe(false);
  });

  it("treats malformed EXIF as possibly containing GPS", () => {
    expect(exifHasGps(new TextEncoder().encode("XX*\0garbage"))).toBe(true);
    const loop = tiff({ gps: false });
    new DataView(loop.buffer).setUint32(8 + 2 + 12, 8, true); // next-IFD pointer back to itself
    expect(exifHasGps(loop)).toBe(true);
  });
});
