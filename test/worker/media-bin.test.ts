// SPDX-License-Identifier: MIT
import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALLOWED_USER } from "../fixtures";
import { call, type FakeGitHub, fakeGitHub, login, mutating } from "./helpers";

let gh: FakeGitHub;
let cookie: string;

const keysOf = async (bucket: R2Bucket) => (await bucket.list()).objects.map((o) => o.key).sort();

beforeEach(async () => {
  gh = fakeGitHub();
  ({ cookie } = await login(gh, ALLOWED_USER));
  for (const bucket of [env.MEDIA, env.DRAFTS]) {
    const listed = await bucket.list();
    if (listed.objects.length) await bucket.delete(listed.objects.map((o) => o.key));
  }
  const meta = { httpMetadata: { contentType: "image/jpeg", cacheControl: "public, max-age=60" }, customMetadata: { alasinSource: "x/b.jpg" } };
  for (const key of ["2026/10/16/b.jpg", "2026/10/16/b-480.webp", "2026/10/16/b-960.webp", "2026/10/16/beach.jpg", "2026/10/16/b-roll.jpg"]) {
    await env.MEDIA.put(key, `bytes of ${key}`, meta);
  }
});
afterEach(() => {
  vi.restoreAllMocks();
});

const post = (action: string, body: Record<string, unknown>) => call(`/api/media-bin/${action}`, mutating(cookie, body));

describe("the Bin for images", () => {
  it("moves an image and its sizes out of MEDIA into the Bin, with who deleted it when", async () => {
    const res = await post("delete", { keys: ["2026/10/16/b.jpg"] });
    expect(await res.json()).toEqual({ deleted: ["2026/10/16/b.jpg"] });
    expect(await keysOf(env.MEDIA)).toEqual(["2026/10/16/b-roll.jpg", "2026/10/16/beach.jpg"]);
    expect(await keysOf(env.DRAFTS)).toEqual(["media-bin/2026/10/16/b-480.webp", "media-bin/2026/10/16/b-960.webp", "media-bin/2026/10/16/b.jpg"]);

    const kept = (await env.DRAFTS.get("media-bin/2026/10/16/b.jpg"))!;
    expect(await kept.text()).toBe("bytes of 2026/10/16/b.jpg");
    expect(kept.httpMetadata?.contentType).toBe("image/jpeg");

    const listed = (await (await call("/api/media-bin", { cookie })).json()) as { images: { key: string; thumb: string; deletedBy: string; deletedAt: string }[] };
    expect(listed.images).toEqual([{ key: "2026/10/16/b.jpg", thumb: "2026/10/16/b-480.webp", deletedBy: expect.any(String), deletedAt: expect.any(String) }]);
    expect(listed.images[0]!.deletedBy).not.toBe("");
    expect(Date.parse(listed.images[0]!.deletedAt)).not.toBeNaN();

    const file = await call("/api/media-bin/file?key=2026/10/16/b-480.webp", { cookie });
    expect(file.status).toBe(200);
    expect(file.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await file.text()).toBe("bytes of 2026/10/16/b-480.webp");
  });

  it("recovers to the same keys with the original metadata, never over something new", async () => {
    await post("delete", { keys: ["2026/10/16/b.jpg"] });
    await env.MEDIA.put("2026/10/16/b.jpg", "new");
    const refused = await post("recover", { key: "2026/10/16/b.jpg" });
    expect(refused.status).toBe(409);
    expect(await (await env.MEDIA.get("2026/10/16/b.jpg"))!.text()).toBe("new");
    expect(await keysOf(env.DRAFTS)).toHaveLength(3);

    await env.MEDIA.delete("2026/10/16/b.jpg");
    expect(await (await post("recover", { key: "2026/10/16/b.jpg" })).json()).toEqual({ key: "2026/10/16/b.jpg" });
    expect(await keysOf(env.DRAFTS)).toEqual([]);
    const back = (await env.MEDIA.get("2026/10/16/b.jpg"))!;
    expect(await back.text()).toBe("bytes of 2026/10/16/b.jpg");
    expect(back.httpMetadata).toMatchObject({ contentType: "image/jpeg", cacheControl: "public, max-age=60" });
    expect(back.customMetadata).toEqual({ alasinSource: "x/b.jpg" });
    expect(await env.MEDIA.head("2026/10/16/b-960.webp")).not.toBeNull();
  });

  it("deletes permanently only inside the Bin", async () => {
    await post("delete", { keys: ["2026/10/16/b.jpg"] });
    expect(await (await post("purge", { keys: ["2026/10/16/b.jpg", "2026/10/16/beach.jpg"] })).json()).toEqual({ removed: 1 });
    expect(await keysOf(env.DRAFTS)).toEqual([]);
    expect(await keysOf(env.MEDIA)).toEqual(["2026/10/16/b-roll.jpg", "2026/10/16/beach.jpg"]);
  });

  it("refuses what isn't a library image, is missing, or is already in the Bin", async () => {
    await env.DRAFTS.put("01JABCDEFGHJKMNPQRSTVWXYZ0/a.jpg", "draft photo");
    for (const keys of [["../x.jpg"], ["2026/10/16/notes.txt"], ["/2026/a.jpg"], []]) {
      expect((await post("delete", { keys })).status).toBe(400);
    }
    expect((await post("delete", { keys: ["2026/10/16/gone.jpg"] })).status).toBe(404);
    expect((await post("purge", { keys: ["../01JABCDEFGHJKMNPQRSTVWXYZ0/a.jpg"] })).status).toBe(400);
    expect((await call("/api/media-bin/file?key=../01JABCDEFGHJKMNPQRSTVWXYZ0/a.jpg", { cookie })).status).toBe(404);

    await post("delete", { keys: ["2026/10/16/b.jpg"] });
    await env.MEDIA.put("2026/10/16/b.jpg", "new");
    const again = await post("delete", { keys: ["2026/10/16/beach.jpg", "2026/10/16/b.jpg"] });
    expect(again.status).toBe(409);
    // Checked before anything moved.
    expect(await env.MEDIA.head("2026/10/16/beach.jpg")).not.toBeNull();
    expect(await env.DRAFTS.head("01JABCDEFGHJKMNPQRSTVWXYZ0/a.jpg")).not.toBeNull();
  });

  it("requires a session and the CSRF header", async () => {
    expect((await call("/api/media-bin")).status).toBe(401);
    const res = await call("/api/media-bin/delete", { method: "POST", cookie, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keys: ["2026/10/16/b.jpg"] }) });
    expect(res.status).toBe(403);
    expect(await env.MEDIA.head("2026/10/16/b.jpg")).not.toBeNull();
  });
});
