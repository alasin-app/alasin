// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { importAesKey, KeyConfigError, open, seal } from "../../src/worker/lib/crypto";
import { redact } from "../../src/worker/lib/log";
import { TEST_SESSION_KEY } from "../fixtures";

describe("crypto", () => {
  it("round-trips and binds the context", async () => {
    const key = await importAesKey("SESSION_KEY", TEST_SESSION_KEY);
    const sealed = await seal(key, "hello", "ctx-a");
    expect(await open(key, sealed, "ctx-a")).toBe("hello");
    expect(await open(key, sealed, "ctx-b")).toBeNull();
    expect(await open(key, sealed.slice(0, -2), "ctx-a")).toBeNull();
  });

  it("rejects keys that aren't 32 bytes", async () => {
    await expect(importAesKey("SESSION_KEY", btoa("short"))).rejects.toBeInstanceOf(KeyConfigError);
    await expect(importAesKey("SESSION_KEY", undefined)).rejects.toBeInstanceOf(KeyConfigError);
  });
});

describe("log redaction", () => {
  it("removes GitHub tokens and JWTs from messages", () => {
    const msg = redact("failed with ghu_abcdefghijklmnop and ghr_abcdefghijklmnop and eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl");
    expect(msg).not.toMatch(/ghu_|ghr_|eyJ/);
  });
});
