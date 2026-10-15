// SPDX-License-Identifier: MIT
//
// Keeping camera metadata without location (`[images] keep_exif`).
//
// Resizing in a canvas drops all metadata. To keep useful EXIF, Alasin copies
// a fixed list of harmless tags from the original into a new, minimal EXIF
// block: camera, lens, exposure and the date taken. Everything else — GPS
// location, serial numbers, maker notes, thumbnails — is left out by design.
// Orientation is left out too: the pixels are already rotated.

import { findExif } from "./image-files";

/** Tags copied from IFD0. */
const IFD0_TAGS = new Set([
  0x010f, // Make
  0x0110, // Model
  0x0132, // DateTime
]);

/** Tags copied from the Exif sub-IFD. */
const EXIF_TAGS = new Set([
  0x829a, // ExposureTime
  0x829d, // FNumber
  0x8822, // ExposureProgram
  0x8827, // ISO
  0x9003, // DateTimeOriginal
  0x9004, // DateTimeDigitized
  0x9010, // OffsetTime
  0x9011, // OffsetTimeOriginal
  0x9201, // ShutterSpeedValue
  0x9202, // ApertureValue
  0x9204, // ExposureBiasValue
  0x9209, // Flash
  0x920a, // FocalLength
  0xa405, // FocalLengthIn35mmFilm
  0xa433, // LensMake
  0xa434, // LensModel
]);

const EXIF_IFD_POINTER = 0x8769;

/** Bytes per component for TIFF field types. */
const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
/** Size of each number to byte-swap (1 = no swapping). */
const SWAP_UNIT: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 4, 7: 1, 9: 4, 10: 4 };

interface Tag {
  tag: number;
  type: number;
  count: number;
  /** Value bytes, little-endian. */
  bytes: Uint8Array;
}

function readIfd(tiff: Uint8Array, view: DataView, le: boolean, offset: number, keep: Set<number>): { tags: Tag[]; exifIfd: number | null } {
  const tags: Tag[] = [];
  let exifIfd: number | null = null;
  if (offset + 2 > tiff.length) return { tags, exifIfd };
  const n = view.getUint16(offset, le);
  for (let i = 0; i < n; i++) {
    const e = offset + 2 + i * 12;
    if (e + 12 > tiff.length) break;
    const tag = view.getUint16(e, le);
    const type = view.getUint16(e + 2, le);
    const count = view.getUint32(e + 4, le);
    if (tag === EXIF_IFD_POINTER) exifIfd = view.getUint32(e + 8, le);
    const size = TYPE_SIZE[type];
    if (!keep.has(tag) || !size || count === 0 || count > 1024) continue;
    const length = size * count;
    const at = length <= 4 ? e + 8 : view.getUint32(e + 8, le);
    if (at + length > tiff.length) continue;
    const bytes = tiff.slice(at, at + length);
    // Normalise to little-endian.
    const unit = SWAP_UNIT[type]!;
    if (!le && unit > 1) for (let j = 0; j < bytes.length; j += unit) bytes.subarray(j, j + unit).reverse();
    tags.push({ tag, type, count, bytes });
  }
  return { tags, exifIfd };
}

/** The whitelisted tags of an EXIF/TIFF block, or null if there are none. */
export function pickSafeTags(tiff: Uint8Array): { ifd0: Tag[]; exif: Tag[] } | null {
  if (tiff.length < 8) return null;
  const order = String.fromCharCode(tiff[0]!, tiff[1]!);
  if (order !== "II" && order !== "MM") return null;
  const le = order === "II";
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  if (view.getUint16(2, le) !== 42) return null;
  const first = readIfd(tiff, view, le, view.getUint32(4, le), IFD0_TAGS);
  const exif = first.exifIfd ? readIfd(tiff, view, le, first.exifIfd, EXIF_TAGS).tags : [];
  if (!first.tags.length && !exif.length) return null;
  return { ifd0: first.tags, exif };
}

/** A little-endian TIFF block with the given tags (and an Exif sub-IFD when needed). */
export function buildExif(tags: { ifd0: Tag[]; exif: Tag[] }): Uint8Array {
  const ifd0 = [...tags.ifd0].sort((a, b) => a.tag - b.tag);
  const exif = [...tags.exif].sort((a, b) => a.tag - b.tag);
  const ifd0Count = ifd0.length + (exif.length ? 1 : 0);
  const ifd0Size = 2 + ifd0Count * 12 + 4;
  const exifSize = exif.length ? 2 + exif.length * 12 + 4 : 0;
  const external = (list: Tag[]) => list.reduce((n, t) => n + (t.bytes.length > 4 ? t.bytes.length + (t.bytes.length % 2) : 0), 0);
  const total = 8 + ifd0Size + exifSize + external(ifd0) + external(exif);
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  out.set([0x49, 0x49, 42, 0, 8, 0, 0, 0]);
  let data = 8 + ifd0Size + exifSize;

  const writeIfd = (at: number, list: Tag[], pointer?: number) => {
    const entries = [...list.map((t) => ({ ...t }))];
    if (pointer !== undefined) {
      const p = new Uint8Array(4);
      new DataView(p.buffer).setUint32(0, pointer, true);
      entries.push({ tag: EXIF_IFD_POINTER, type: 4, count: 1, bytes: p });
      entries.sort((a, b) => a.tag - b.tag);
    }
    v.setUint16(at, entries.length, true);
    entries.forEach((t, i) => {
      const e = at + 2 + i * 12;
      v.setUint16(e, t.tag, true);
      v.setUint16(e + 2, t.type, true);
      v.setUint32(e + 4, t.count, true);
      if (t.bytes.length <= 4) out.set(t.bytes, e + 8);
      else {
        v.setUint32(e + 8, data, true);
        out.set(t.bytes, data);
        data += t.bytes.length + (t.bytes.length % 2);
      }
    });
    v.setUint32(at + 2 + entries.length * 12, 0, true); // no next IFD
  };
  writeIfd(8, ifd0, exif.length ? 8 + ifd0Size : undefined);
  if (exif.length) writeIfd(8 + ifd0Size, exif);
  return out;
}

/** Inserts an EXIF block into a JPEG (after its JFIF segment, if any). */
export function insertExifIntoJpeg(jpeg: Uint8Array, tiff: Uint8Array): Uint8Array {
  const payload = new Uint8Array(6 + tiff.length);
  payload.set([0x45, 0x78, 0x69, 0x66, 0, 0]); // "Exif\0\0"
  payload.set(tiff, 6);
  const length = payload.length + 2;
  if (length > 0xffff) return jpeg;
  let at = 2;
  if (jpeg[2] === 0xff && jpeg[3] === 0xe0) at = 4 + ((jpeg[4]! << 8) | jpeg[5]!);
  const out = new Uint8Array(jpeg.length + 4 + payload.length);
  out.set(jpeg.subarray(0, at));
  out.set([0xff, 0xe1, length >> 8, length & 0xff], at);
  out.set(payload, at + 4);
  out.set(jpeg.subarray(at), at + 4 + payload.length);
  return out;
}

/** The re-encoded JPEG with the original's safe EXIF tags, or unchanged if there are none. */
export function carrySafeExif(original: Uint8Array, encodedJpeg: Uint8Array): Uint8Array {
  const exif = findExif(original, "image/jpeg");
  const tags = exif && pickSafeTags(exif);
  return tags ? insertExifIntoJpeg(encodedJpeg, buildExif(tags)) : encodedJpeg;
}
