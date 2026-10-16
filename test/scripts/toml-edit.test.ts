// SPDX-License-Identifier: MIT
import { parse } from "smol-toml";
import { describe, expect, it } from "vitest";
import { setValue } from "../../scripts/lib/toml-edit";
import alasinExample from "../../alasin.example.toml?raw";
import wranglerExample from "../../wrangler.example.toml?raw";

describe("toml-edit", () => {
  it("replaces a value and keeps comments", () => {
    const out = setValue(alasinExample, "[github]", "owner", "someone");
    expect((parse(out) as { github: { owner: string } }).github.owner).toBe("someone");
    expect(out).toContain("# Owner (user or organisation) of the site repository.");
    expect(out.split("\n").length).toBe(alasinExample.split("\n").length);
  });

  it("uncomments a documented optional key in place", () => {
    const out = setValue(alasinExample, "[github]", "installation_id", 42);
    expect((parse(out) as { github: { installation_id: number } }).github.installation_id).toBe(42);
    expect(out).not.toContain("# installation_id = 12345678");
  });

  it("replaces a multi-line array", () => {
    const allow = [
      { login: "a", id: 1 },
      { login: "b", id: 2 },
    ];
    const out = setValue(alasinExample, "[users]", "allow", allow);
    expect((parse(out) as { users: { allow: unknown } }).users.allow).toEqual(allow);
    // Setting it twice is stable.
    expect(setValue(out, "[users]", "allow", allow)).toBe(out);
  });

  it("selects one block among [[array]] tables", () => {
    const out = setValue(wranglerExample, "[[r2_buckets]]", "bucket_name", "my-drafts", { where: { key: "binding", value: "DRAFTS" } });
    const buckets = (parse(out) as { r2_buckets: { binding: string; bucket_name: string }[] }).r2_buckets;
    expect(buckets.find((b) => b.binding === "DRAFTS")!.bucket_name).toBe("my-drafts");
    expect(buckets.find((b) => b.binding === "MEDIA")!.bucket_name).toBe("example-media");
  });

  it("sets root keys, creating missing ones after the header comment", () => {
    let out = setValue(wranglerExample, "", "routes", [{ pattern: "alasin.example.com", custom_domain: true }]);
    out = setValue(out, "", "account_id", "abc");
    const parsed = parse(out) as { routes: unknown; account_id: string; name: string };
    expect(parsed.routes).toEqual([{ pattern: "alasin.example.com", custom_domain: true }]);
    expect(parsed.account_id).toBe("abc");
    expect(parsed.name).toBe("alasin");
  });

  it("creates a missing table at the end", () => {
    const out = setValue("[a]\nx = 1\n", "[env.dev.app]", "url", "https://x.example.com");
    expect(parse(out)).toEqual({ a: { x: 1 }, env: { dev: { app: { url: "https://x.example.com" } } } });
  });

  it("escapes strings", () => {
    const out = setValue("[a]\nx = 1\n", "[a]", "x", 'quote " and \\ backslash');
    expect((parse(out) as { a: { x: string } }).a.x).toBe('quote " and \\ backslash');
  });
});

describe("removeValue", () => {
  it("removes a key with a multi-line value from one table, keeping comments and other tables", async () => {
    const { removeValue } = await import("../../scripts/lib/toml-edit");
    const text = `[users]\n# who\nallow = [\n  { login = "a", id = 1 },\n  { login = "b", id = 2 },\n]\n\n[env.dev.users]\nallow = [{ login = "c", id = 3 }]\n`;
    expect(removeValue(text, "[users]", "allow")).toBe(`[users]\n# who\n\n[env.dev.users]\nallow = [{ login = "c", id = 3 }]\n`);
    expect(removeValue(text, "[env.dev.users]", "allow")).toBe(`[users]\n# who\nallow = [\n  { login = "a", id = 1 },\n  { login = "b", id = 2 },\n]\n\n[env.dev.users]\n`);
    expect(removeValue(text, "[media]", "allow")).toBe(text);
  });
});
