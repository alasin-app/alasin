// SPDX-License-Identifier: MIT
//
// Recognises image files by their content (never by name or declared type) and
// finds EXIF metadata, in particular GPS location, in JPEG, PNG and WebP.
// Used by the Worker to validate uploads and by the browser's image pipeline.

export type ImageType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));

/** The image type the bytes actually contain, or null (SVG and anything else). */
export function sniffImageType(b: Uint8Array): ImageType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return "image/png";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "image/webp";
  if (b.length >= 6 && (ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a")) return "image/gif";
  return null;
}

/** The TIFF-structured EXIF block of an image, or null if it has none. */
export function findExif(b: Uint8Array, type: ImageType): Uint8Array | null {
  if (type === "image/jpeg") {
    let i = 2;
    while (i + 4 <= b.length && b[i] === 0xff) {
      const marker = b[i + 1]!;
      if (marker === 0xd9 || marker === 0xda) break; // end of image / start of scan
      const length = (b[i + 2]! << 8) | b[i + 3]!;
      if (length < 2) break;
      if (marker === 0xe1 && ascii(b, i + 4, 6) === "Exif\0\0") return b.subarray(i + 10, i + 2 + length);
      i += 2 + length;
    }
    return null;
  }
  if (type === "image/png") {
    let i = 8;
    while (i + 12 <= b.length) {
      const length = ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;
      const name = ascii(b, i + 4, 4);
      if (name === "eXIf") return b.subarray(i + 8, i + 8 + length);
      if (name === "IEND") break;
      i += 12 + length;
    }
    return null;
  }
  if (type === "image/webp") {
    let i = 12;
    while (i + 8 <= b.length) {
      const name = ascii(b, i, 4);
      const length = (b[i + 4]! | (b[i + 5]! << 8) | (b[i + 6]! << 16) | (b[i + 7]! << 24)) >>> 0;
      if (name === "EXIF") {
        const data = b.subarray(i + 8, i + 8 + length);
        // Some writers keep the JPEG-style "Exif\0\0" prefix.
        return ascii(data, 0, 6) === "Exif\0\0" ? data.subarray(6) : data;
      }
      i += 8 + length + (length % 2);
    }
    return null;
  }
  return null;
}

const GPS_IFD_POINTER = 0x8825;

/** True if a TIFF/EXIF block points to GPS data. Malformed blocks count as containing GPS (fail closed). */
export function exifHasGps(tiff: Uint8Array): boolean {
  if (tiff.length < 8) return false;
  const order = ascii(tiff, 0, 2);
  if (order !== "II" && order !== "MM") return true;
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const le = order === "II";
  if (view.getUint16(2, le) !== 42) return true;
  let ifd = view.getUint32(4, le);
  const seen = new Set<number>();
  // IFD0 and any following IFDs (e.g. the thumbnail's).
  while (ifd !== 0) {
    if (seen.has(ifd) || ifd + 2 > tiff.length) return true;
    seen.add(ifd);
    const count = view.getUint16(ifd, le);
    if (ifd + 2 + count * 12 + 4 > tiff.length) return true;
    for (let e = 0; e < count; e++) {
      if (view.getUint16(ifd + 2 + e * 12, le) === GPS_IFD_POINTER) return true;
    }
    ifd = view.getUint32(ifd + 2 + count * 12, le);
  }
  return false;
}

/** True if the image carries GPS location data in its EXIF metadata. */
export function hasGpsLocation(b: Uint8Array, type: ImageType): boolean {
  const exif = findExif(b, type);
  return exif !== null && exifHasGps(exif);
}
