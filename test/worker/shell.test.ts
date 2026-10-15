// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { call } from "./helpers";

describe("app shell routes", () => {
  it("serves PNG icons in the configured sizes", async () => {
    for (const size of [180, 192, 512]) {
      const res = await call(`/icons/icon-${size}.png`);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/png");
      const bytes = new Uint8Array(await res.arrayBuffer());
      expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const view = new DataView(bytes.buffer);
      expect(view.getUint32(16)).toBe(size); // IHDR width
      expect(view.getUint32(20)).toBe(size); // IHDR height
    }
    expect((await call("/icons/icon-999.png")).status).toBe(404);
  });

  it("tints the SVG icon with the accent colour", async () => {
    const svg = await (await call("/icons/icon.svg")).text();
    expect(svg).toContain('fill="#007AFF"');
    expect(svg).not.toContain("<script");
  });

  it("serves a web app manifest named after the deployment", async () => {
    const res = await call("/manifest.webmanifest");
    expect(res.headers.get("Content-Type")).toBe("application/manifest+json");
    const manifest = (await res.json()) as { name: string; display: string; icons: { src: string }[] };
    expect(manifest.name).toBe("Alasin TEST");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.map((i) => i.src)).toContain("/icons/icon-180.png");
  });

  it("rejects non-GET requests to static paths", async () => {
    expect((await call("/", { method: "PUT", headers: { "X-Alasin": "1", Origin: "https://alasin.example.com" } })).status).toBe(405);
  });
});
