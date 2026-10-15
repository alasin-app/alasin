// SPDX-License-Identifier: MIT
// Tiny synthetic image files for tests: valid headers, optional EXIF with or without GPS.

const enc = new TextEncoder();

function concat(...parts: (Uint8Array | number[])[]): Uint8Array {
  const arrays = parts.map((p) => (p instanceof Uint8Array ? p : new Uint8Array(p)));
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrays) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

/** A TIFF/EXIF block whose IFD0 has one entry: Orientation, or the GPS IFD pointer. */
export function tiff(opts: { gps: boolean; bigEndian?: boolean }): Uint8Array {
  const b = new Uint8Array(8 + 2 + 12 + 4);
  const v = new DataView(b.buffer);
  const le = !opts.bigEndian;
  b.set(enc.encode(le ? "II" : "MM"), 0);
  v.setUint16(2, 42, le);
  v.setUint32(4, 8, le);
  v.setUint16(8, 1, le);
  v.setUint16(10, opts.gps ? 0x8825 : 0x0112, le); // GPSInfo pointer or Orientation
  v.setUint16(12, opts.gps ? 4 : 3, le);
  v.setUint32(14, 1, le);
  v.setUint32(18, opts.gps ? 0 : 1, le);
  v.setUint32(22, 0, le);
  return b;
}

export function jpeg(opts: { exif?: boolean; gps?: boolean; bigEndian?: boolean } = {}): Uint8Array {
  const parts: (Uint8Array | number[])[] = [[0xff, 0xd8]];
  if (opts.exif || opts.gps) {
    const payload = concat(enc.encode("Exif\0\0"), tiff({ gps: !!opts.gps, bigEndian: opts.bigEndian }));
    parts.push([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff], payload);
  }
  parts.push([0xff, 0xdb, 0x00, 0x04, 0x00, 0x00], [0xff, 0xda, 0x00, 0x02], [0x11, 0x22], [0xff, 0xd9]);
  return concat(...parts);
}

function pngChunk(name: string, data: Uint8Array): Uint8Array {
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, data.length);
  return concat(len, enc.encode(name), data, [0, 0, 0, 0]);
}

export function png(opts: { gps?: boolean } = {}): Uint8Array {
  return concat(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    pngChunk("IHDR", new Uint8Array(13)),
    opts.gps ? pngChunk("eXIf", tiff({ gps: true })) : new Uint8Array(0),
    pngChunk("IEND", new Uint8Array(0)),
  );
}

export function webp(opts: { gps?: boolean; exifPrefix?: boolean } = {}): Uint8Array {
  const chunk = (name: string, data: Uint8Array) => {
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, data.length, true);
    return concat(enc.encode(name), len, data, data.length % 2 ? [0] : []);
  };
  const body = concat(
    enc.encode("WEBP"),
    chunk("VP8 ", new Uint8Array(10)),
    opts.gps ? chunk("EXIF", opts.exifPrefix ? concat(enc.encode("Exif\0\0"), tiff({ gps: true })) : tiff({ gps: true })) : new Uint8Array(0),
  );
  const size = new Uint8Array(4);
  new DataView(size.buffer).setUint32(0, body.length, true);
  return concat(enc.encode("RIFF"), size, body);
}

export const gif = () => concat(enc.encode("GIF89a"), new Uint8Array(20));
export const svg = () => enc.encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
