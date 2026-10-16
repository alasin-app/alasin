// SPDX-License-Identifier: MIT
import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseConfig } from "../../src/shared/config/schema";
import { ulid } from "../../src/shared/ulid";
import { cleanupDrafts } from "../../src/worker/cleanup";
import { appJwt } from "../../src/worker/lib/installation";
import { Repo } from "../../src/worker/lib/repo";
import { testConfig } from "../fixtures";
import { type FakeGitHub, fakeGitHub } from "./helpers";

let gh: FakeGitHub;
const config = parseConfig(testConfig);
const DAY = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  gh = fakeGitHub();
  const listed = await env.DRAFTS.list();
  if (listed.objects.length) await env.DRAFTS.delete(listed.objects.map((o) => o.key));
});
afterEach(() => {
  vi.restoreAllMocks();
});

const repo = () => new Repo("installation-token", gh.repo.owner, gh.repo.name, gh.repo.branch);
const keys = async () => (await env.DRAFTS.list()).objects.map((o) => o.key).sort();

describe("nightly cleanup of the drafts bucket", () => {
  it("removes photos of drafts that no longer exist, keeping drafts in the folder and in the Bin", async () => {
    const [kept, binned, gone] = [ulid(), ulid(), ulid()];
    await gh.repo.write(`drafts/posts/${kept}.md`, "---\ntitle: a\n---\n");
    await gh.repo.write(`bin/drafts/pages/${binned}.md`, "---\ntitle: b\n---\n");
    for (const id of [kept, binned, gone]) await env.DRAFTS.put(`${id}/photo.jpg`, "x");
    await env.DRAFTS.put(`${gone}/photo-480.webp`, "x");

    // Uploaded "now"; the cleanup runs 8 days later.
    const result = await cleanupDrafts(env.DRAFTS, repo(), config, Date.now() + 8 * DAY);
    expect(result).toEqual({ folders: 3, removedFolders: [gone], removedObjects: 2 });
    expect(await keys()).toEqual([`${binned}/photo.jpg`, `${kept}/photo.jpg`].sort());
    expect(new Set(gh.repo.tokens)).toEqual(new Set(["installation-token"]));
  });

  it("waits cleanup_after_days, for drafts only on someone's device and editing sessions in progress", async () => {
    const id = ulid();
    await env.DRAFTS.put(`${id}/photo.jpg`, "x");
    expect((await cleanupDrafts(env.DRAFTS, repo(), config, Date.now() + 6 * DAY)).removedFolders).toEqual([]);
    expect((await cleanupDrafts(env.DRAFTS, repo(), config, Date.now() + 8 * DAY)).removedFolders).toEqual([id]);
  });

  it("deletes nothing if the repository can't be read", async () => {
    const id = ulid();
    await env.DRAFTS.put(`${id}/photo.jpg`, "x");
    const broken = new Repo("installation-token", "nobody", "missing", "main");
    vi.spyOn(broken, "listDir").mockRejectedValue(new Error("GitHub is down"));
    await expect(cleanupDrafts(env.DRAFTS, broken, config, Date.now() + 30 * DAY)).rejects.toThrow("GitHub is down");
    expect(await keys()).toEqual([`${id}/photo.jpg`]);
  });

  it("leaves keys that aren't draft folders alone", async () => {
    await env.DRAFTS.put("not-a-draft/x.jpg", "x");
    expect((await cleanupDrafts(env.DRAFTS, repo(), config, Date.now() + 30 * DAY)).removedFolders).toEqual([]);
  });
});

describe("GitHub App JWT", () => {
  it("is RS256-signed with the app's key, issued for 9 minutes", async () => {
    const pair = (await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    const der = new Uint8Array((await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer);
    const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der)).replace(/.{64}/g, "$&\n")}\n-----END PRIVATE KEY-----\n`;
    const now = Date.UTC(2026, 9, 16, 12, 0, 0);
    const jwt = await appJwt(123456, pem, now);
    const [h, p, s] = jwt.split(".") as [string, string, string];
    const decode = (x: string) => Uint8Array.from(atob(x.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    expect(JSON.parse(new TextDecoder().decode(decode(h)))).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(new TextDecoder().decode(decode(p)))).toEqual({ iat: now / 1000 - 60, exp: now / 1000 + 540, iss: "123456" });
    expect(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", pair.publicKey, decode(s), new TextEncoder().encode(`${h}.${p}`))).toBe(true);
  });
});
