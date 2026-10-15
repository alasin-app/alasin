// SPDX-License-Identifier: MIT
// App icons drawn from the configured accent colour, so each deployment (e.g.
// a dev environment with a different colour) gets its own icon tint without
// separate image files. PNG output uses a small scanline rasteriser and the
// runtime's deflate stream, which keeps CPU time to a few milliseconds.

/** Anvil outline on a 100 × 100 canvas. */
const ANVIL: [number, number][] = [
  [12, 33], [30, 29], [86, 29], [86, 41], [74, 43], [66, 50], [66, 60], [76, 67],
  [76, 74], [30, 74], [30, 67], [40, 60], [40, 50], [33, 44], [24, 41], [16, 37],
];

export const PNG_SIZES = [180, 192, 512] as const;

export function iconSvg(accent: string): string {
  const points = ANVIL.map(([x, y]) => `${x},${y}`).join(" ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="${accent}"/><polygon points="${points}" fill="#fff"/></svg>`;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Coverage (0–1) of the anvil per pixel, 4× vertical supersampling with exact horizontal span ends. */
function rasterize(size: number): Float32Array {
  const cov = new Float32Array(size * size);
  const scale = size / 100;
  const pts = ANVIL.map(([x, y]) => [x * scale, y * scale] as const);
  const SUB = 4;
  const xs: number[] = [];
  for (let row = 0; row < size; row++) {
    for (let s = 0; s < SUB; s++) {
      const y = row + (s + 0.5) / SUB;
      xs.length = 0;
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i]!;
        const [x1, y1] = pts[(i + 1) % pts.length]!;
        if ((y0 <= y && y < y1) || (y1 <= y && y < y0)) xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const a = Math.max(0, xs[k]!);
        const b = Math.min(size, xs[k + 1]!);
        if (b <= a) continue;
        const ia = Math.floor(a);
        const ib = Math.floor(b);
        const base = row * size;
        if (ia === ib) {
          cov[base + ia]! += (b - a) / SUB;
          continue;
        }
        cov[base + ia]! += (ia + 1 - a) / SUB;
        for (let x = ia + 1; x < ib && x < size; x++) cov[base + x]! += 1 / SUB;
        if (ib < size) cov[base + ib]! += (b - ib) / SUB;
      }
    }
  }
  return cov;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Full-bleed square PNG (iOS and Android apply their own corner mask). */
export async function iconPng(accent: string, size: number): Promise<Uint8Array> {
  const [r, g, b] = hexToRgb(accent);
  const cov = rasterize(size);
  const stride = size * 3 + 1;
  const raw = new Uint8Array(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const a = Math.min(1, cov[y * size + x]!);
      const o = y * stride + 1 + x * 3;
      raw[o] = Math.round(r + (255 - r) * a);
      raw[o + 1] = Math.round(g + (255 - g) * a);
      raw[o + 2] = Math.round(b + (255 - b) * a);
    }
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, size);
  v.setUint32(4, size);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", await deflate(raw)),
    chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
