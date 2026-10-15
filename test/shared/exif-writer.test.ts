// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { buildExif, carrySafeExif, pickSafeTags } from "../../src/shared/exif-writer";
import { exifHasGps, findExif } from "../../src/shared/image-files";
import { jpeg } from "../images";

const enc = new TextEncoder();

/** A TIFF block: IFD0 with Make, Orientation, GPS pointer, Exif pointer; Exif IFD with ISO and LensModel. */
function cameraTiff(le: boolean): Uint8Array {
  const b = new Uint8Array(200);
  const v = new DataView(b.buffer);
  b.set(enc.encode(le ? "II" : "MM"));
  v.setUint16(2, 42, le);
  v.setUint32(4, 8, le);
  // IFD0 at 8: 4 entries
  v.setUint16(8, 4, le);
  const entry = (at: number, tag: number, type: number, count: number, value: number) => {
    v.setUint16(at, tag, le);
    v.setUint16(at + 2, type, le);
    v.setUint32(at + 4, count, le);
    if (type === 3 && count === 1) v.setUint16(at + 8, value, le);
    else v.setUint32(at + 8, value, le);
  };
  entry(10, 0x010f, 2, 8, 120); // Make -> "Example\0" at 120
  entry(22, 0x0112, 3, 1, 6); // Orientation 6
  entry(34, 0x8769, 4, 1, 60); // Exif IFD at 60
  entry(46, 0x8825, 4, 1, 100); // GPS IFD at 100
  v.setUint32(58, 0, le);
  // Exif IFD at 60: 2 entries
  v.setUint16(60, 2, le);
  entry(62, 0x8827, 3, 1, 400); // ISO 400
  entry(74, 0xa434, 2, 6, 140); // LensModel "Lens1\0" at 140
  v.setUint32(86, 0, le);
  // GPS IFD at 100: 1 entry (latitude ref)
  v.setUint16(100, 1, le);
  entry(102, 0x0001, 2, 2, 0x4e000000);
  b.set(enc.encode("Example\0"), 120);
  b.set(enc.encode("Lens1\0"), 140);
  return b;
}

function tag(tiff: Uint8Array, id: number): { type: number; value: number | string } | undefined {
  const picked = pickSafeTags(tiff)!;
  const t = [...picked.ifd0, ...picked.exif].find((x) => x.tag === id);
  if (!t) return undefined;
  if (t.type === 2) return { type: 2, value: new TextDecoder().decode(t.bytes).replace(/\0+$/, "") };
  return { type: t.type, value: new DataView(t.bytes.buffer, t.bytes.byteOffset).getUint16(0, true) };
}

describe("safe EXIF", () => {
  for (const le of [true, false]) {
    it(`keeps camera tags and drops GPS and orientation (${le ? "little" : "big"}-endian source)`, () => {
      const src = cameraTiff(le);
      expect(exifHasGps(src)).toBe(true);
      const out = buildExif(pickSafeTags(src)!);
      expect(exifHasGps(out)).toBe(false);
      expect(tag(out, 0x010f)).toEqual({ type: 2, value: "Example" });
      expect(tag(out, 0x8827)).toEqual({ type: 3, value: 400 });
      expect(tag(out, 0xa434)).toEqual({ type: 2, value: "Lens1" });
      expect(tag(out, 0x0112)).toBeUndefined();
    });
  }

  it("carries the safe tags into a re-encoded JPEG", () => {
    const original = new Uint8Array([...jpeg().subarray(0, 2), 0xff, 0xe1, 0, 0, ...enc.encode("Exif\0\0"), ...cameraTiff(true), ...jpeg().subarray(2)]);
    const len = 2 + 6 + cameraTiff(true).length;
    original[4] = len >> 8;
    original[5] = len & 0xff;
    const reencoded = jpeg();
    const out = carrySafeExif(original, reencoded);
    const exif = findExif(out, "image/jpeg")!;
    expect(exif).not.toBeNull();
    expect(exifHasGps(exif)).toBe(false);
    expect(tag(exif, 0x010f)?.value).toBe("Example");
  });

  it("leaves a JPEG without EXIF unchanged", () => {
    const encoded = jpeg();
    expect(carrySafeExif(jpeg(), encoded)).toBe(encoded);
  });
});
