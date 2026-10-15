// SPDX-License-Identifier: MIT
import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseConfig } from "../../src/shared/config/schema";
import { ulid } from "../../src/shared/ulid";
import { ALLOWED_USER, APP_URL, testConfig } from "../fixtures";
import { gif, jpeg, png, svg, webp } from "../images";
import { call, type FakeGitHub, fakeGitHub, login } from "./helpers";

let gh: FakeGitHub;
let cookie: string;

beforeEach(async () => {
  gh = fakeGitHub();
  ({ cookie } = await login(gh, ALLOWED_USER));
});
afterEach(() => {
  vi.restoreAllMocks();
});

function upload(id: string, file: string, bytes: Uint8Array, type: string, envOverrides = {}) {
  return call(
    `/api/draft-media/${id}/${file}`,
    { method: "PUT", cookie, headers: { "X-Alasin": "1", Origin: APP_URL, "Content-Type": type }, body: bytes },
    envOverrides,
  );
}

function names(id: string, name: string) {
  return call(`/api/draft-media/${id}/names`, {
    method: "POST",
    cookie,
    headers: { "X-Alasin": "1", Origin: APP_URL, "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

describe("draft media", () => {
  it("stores an image under the draft's prefix in DRAFTS, with the type set by the server", async () => {
    const id = ulid();
    const res = await upload(id, "img_3438.jpg", jpeg({ exif: true }), "image/jpeg");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ key: `${id}/img_3438.jpg`, url: `/api/draft-media/${id}/img_3438.jpg` });
    const object = await env.DRAFTS.head(`${id}/img_3438.jpg`);
    expect(object?.httpMetadata?.contentType).toBe("image/jpeg");
    expect((await env.MEDIA.list()).objects).toHaveLength(0);
  });

  it("accepts the resized variants", async () => {
    const id = ulid();
    expect((await upload(id, "img_3438-480.webp", webp(), "image/webp")).status).toBe(200);
    expect((await upload(id, "img_3438-1600.webp", webp(), "image/webp")).status).toBe(200);
  });

  it("rejects SVG and other non-image content", async () => {
    const id = ulid();
    expect((await upload(id, "x.png", svg(), "image/png")).status).toBe(415);
    expect((await upload(id, "x.jpg", new TextEncoder().encode("<html>"), "image/jpeg")).status).toBe(415);
  });

  it("rejects a declared type or extension that doesn't match the content", async () => {
    const id = ulid();
    expect((await upload(id, "x.jpg", png(), "image/jpeg")).status).toBe(415);
    expect((await upload(id, "x.png", png(), "image/jpeg")).status).toBe(415);
    expect((await upload(id, "x.jpg", gif(), "image/gif")).status).toBe(415);
  });

  it("rejects images that still contain GPS location data", async () => {
    const id = ulid();
    for (const [file, bytes, type] of [
      ["a.jpg", jpeg({ gps: true }), "image/jpeg"],
      ["b.png", png({ gps: true }), "image/png"],
      ["c.webp", webp({ gps: true }), "image/webp"],
    ] as const) {
      const res = await upload(id, file, bytes, type);
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ error: "gps" });
    }
    expect((await env.DRAFTS.list({ prefix: `${id}/` })).objects).toHaveLength(0);
  });

  it("rejects oversized files", async () => {
    const id = ulid();
    const small = JSON.stringify(parseConfig({ ...testConfig, images: { max_upload_mb: 0.00001 } }));
    const res = await upload(id, "big.jpg", jpeg({ exif: true }), "image/jpeg", { ALASIN_CONFIG_JSON: small });
    expect(res.status).toBe(413);
  });

  it("rejects path tricks in draft IDs and file names", async () => {
    const id = ulid();
    const before = (await env.DRAFTS.list()).objects.map((o) => o.key).sort();
    for (const [draft, file] of [
      ["..", "x.jpg"],
      [id.toLowerCase(), "x.jpg"],
      [id, "..%2F..%2Fx.jpg"],
      [id, "IMG_1.JPG"],
      [id, ".jpg"],
      [id, "x.svg"],
      [id, "x.jpg.html"],
    ]) {
      const res = await upload(draft!, file!, jpeg(), "image/jpeg");
      // 415: "/api/draft-media/../x.jpg" normalises to a non-upload route, where image bodies are refused.
      expect([400, 404, 415]).toContain(res.status);
    }
    expect((await env.DRAFTS.list()).objects.map((o) => o.key).sort()).toEqual(before);
  });

  it("never writes to the public MEDIA bucket", async () => {
    const id = ulid();
    await upload(id, "a.jpg", jpeg(), "image/jpeg");
    await upload(id, "a-480.webp", webp(), "image/webp");
    expect((await env.MEDIA.list()).objects).toHaveLength(0);
  });

  it("serves draft images to logged-in users only, never cached", async () => {
    const id = ulid();
    await upload(id, "a.png", png(), "image/png");
    const res = await call(`/api/draft-media/${id}/a.png`, { cookie });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect((await call(`/api/draft-media/${id}/a.png`)).status).toBe(401);
    expect((await call(`/api/draft-media/${id}/missing.png`, { cookie })).status).toBe(404);
  });

  it("gives each upload a free name based on the original file name", async () => {
    const id = ulid();
    expect(await (await names(id, "IMG_3438.JPG")).json()).toEqual({ base: "img_3438" });
    await upload(id, "img_3438.jpg", jpeg(), "image/jpeg");
    await upload(id, "img_3438-480.webp", webp(), "image/webp");
    expect(await (await names(id, "IMG_3438.HEIC")).json()).toEqual({ base: "img_3438-2" });
    // "photo-2024" must not be handed out again although it looks like a variant of "photo".
    await upload(id, "photo-2024.jpg", jpeg(), "image/jpeg");
    expect(await (await names(id, "photo-2024.jpg")).json()).toEqual({ base: "photo-2024-2" });
  });

  it("requires the CSRF header for uploads", async () => {
    const id = ulid();
    const res = await call(`/api/draft-media/${id}/a.jpg`, {
      method: "PUT",
      cookie,
      headers: { Origin: APP_URL, "Content-Type": "image/jpeg" },
      body: jpeg(),
    });
    expect(res.status).toBe(403);
  });

  it("only allows binary bodies on the upload route", async () => {
    const res = await call("/api/drafts/post/" + ulid(), {
      method: "PUT",
      cookie,
      headers: { "X-Alasin": "1", Origin: APP_URL, "Content-Type": "image/jpeg" },
      body: jpeg(),
    });
    expect(res.status).toBe(415);
  });
});

describe("draft media listing", () => {
  it("lists main images with their smallest variant as thumbnail", async () => {
    const id = ulid();
    await upload(id, "img_1.jpg", jpeg(), "image/jpeg");
    await upload(id, "img_1-960.webp", webp(), "image/webp");
    await upload(id, "img_1-480.webp", webp(), "image/webp");
    await upload(id, "photo-2024.jpg", jpeg(), "image/jpeg"); // looks like a variant, but "photo" doesn't exist
    const { images } = (await (await call(`/api/draft-media/${id}`, { cookie })).json()) as {
      images: { file: string; thumb: string }[];
    };
    expect(images.map((i) => i.file).sort()).toEqual(["img_1.jpg", "photo-2024.jpg"]);
    expect(images.find((i) => i.file === "img_1.jpg")!.thumb).toBe(`/api/draft-media/${id}/img_1-480.webp`);
    expect((await call(`/api/draft-media/${id}`)).status).toBe(401);
    expect((await call("/api/draft-media/not-an-id", { cookie })).status).toBe(404);
  });
});
