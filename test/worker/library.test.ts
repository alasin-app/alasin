// SPDX-License-Identifier: MIT
import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseConfig } from "../../src/shared/config/schema";
import { ALLOWED_USER, testConfig } from "../fixtures";
import { call, type FakeGitHub, fakeGitHub, login } from "./helpers";

let gh: FakeGitHub;
let cookie: string;

beforeEach(async () => {
  gh = fakeGitHub();
  ({ cookie } = await login(gh, ALLOWED_USER));
  const listed = await env.MEDIA.list();
  if (listed.objects.length) await env.MEDIA.delete(listed.objects.map((o) => o.key));
  for (const key of ["2025/12/24/tree.jpg", "2026/09/01/a.jpg", "2026/10/16/b.jpg", "2026/10/16/b-480.webp", "2026/10/16/notes.txt", "site/logo.png"]) {
    await env.MEDIA.put(key, "x");
  }
});
afterEach(() => {
  vi.restoreAllMocks();
});

const get = async (path: string, env?: Record<string, string>) => (await call(path, { cookie }, env)).json();

describe("media library", () => {
  it("lists a level at a time: years, then months", async () => {
    expect(await get("/api/media/folders?prefix=")).toEqual({ prefix: "", folders: ["2025/", "2026/", "site/"] });
    expect(await get("/api/media/folders?prefix=2026/")).toEqual({ prefix: "2026/", folders: ["2026/09/", "2026/10/"] });
  });

  it("lists the images of a month, not other files", async () => {
    const res = (await get("/api/media/files?prefix=2026/10/")) as { files: { key: string }[]; cursor: string | null };
    expect(res.files.map((f) => f.key)).toEqual(["2026/10/16/b-480.webp", "2026/10/16/b.jpg"]);
    expect(res.cursor).toBeNull();
  });

  it("lists a year by month, variants grouped, for the counts", async () => {
    expect(await get("/api/media/year?prefix=2026/")).toEqual({
      prefix: "2026/",
      months: {
        "2026/09/": [{ key: "2026/09/01/a.jpg", thumb: "2026/09/01/a.jpg" }],
        "2026/10/": [{ key: "2026/10/16/b.jpg", thumb: "2026/10/16/b-480.webp" }],
      },
    });
    expect((await call("/api/media/year?prefix=2026/10/", { cookie })).status).toBe(400);
  });

  it("stays inside the browse prefixes", async () => {
    const limited = { ALASIN_CONFIG_JSON: JSON.stringify(parseConfig({ ...testConfig, media: { ...testConfig.media, browse_prefixes: ["2026/"] } })) };
    expect(((await get("/api/media/folders?prefix=", limited)) as { folders: string[] }).folders).toEqual(["2026/"]);
    expect(((await get("/api/media/folders?prefix=2026/", limited)) as { folders: string[] }).folders).toEqual(["2026/09/", "2026/10/"]);
    expect((await call("/api/media/files?prefix=site/", { cookie }, limited)).status).toBe(400);
    expect((await call("/api/media/files?prefix=../x", { cookie })).status).toBe(400);
    expect((await call("/api/media/year?prefix=2025/", { cookie }, limited)).status).toBe(400);
  });
});
