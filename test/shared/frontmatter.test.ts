// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  applyChanges,
  formatDateInZone,
  joinFile,
  parseFields,
  slugify,
  splitFrontMatter,
  stringifyFields,
} from "../../src/shared/frontmatter";

const POST = `---
title: "1.8. Akaa - Kylmäkoski - Urjala"
date: 2025-08-01T15:58:00+03:00
slug: "1-8-akaa-kylmakoski-urjala"
draft: false
categories: ["kesaloma-2025"]
image: "/img/2025/08/01/img_3438.jpg"
author: "Example"
custom_field: 11002
---

Body text.
`;

describe("front matter", () => {
  it("splits YAML and TOML front matter from the body", () => {
    const y = splitFrontMatter(POST)!;
    expect(y.format).toBe("yaml");
    expect(y.body).toBe("\nBody text.\n");
    const t = splitFrontMatter('+++\ntitle = "x"\n+++\nBody')!;
    expect(t).toEqual({ format: "toml", raw: 'title = "x"', body: "Body" });
    expect(splitFrontMatter("no front matter")).toBeNull();
  });

  it("parses fields in order, keeping dates as strings", () => {
    const f = parseFields("yaml", splitFrontMatter(POST)!.raw);
    expect([...f.keys()]).toEqual(["title", "date", "slug", "draft", "categories", "image", "author", "custom_field"]);
    expect(f.get("date")).toBe("2025-08-01T15:58:00+03:00");
    expect(f.get("categories")).toEqual(["kesaloma-2025"]);
  });

  it("writes YAML in the common Hugo style and round-trips this file exactly", () => {
    const { raw, body, format } = splitFrontMatter(POST)!;
    expect(joinFile(format, stringifyFields(format, parseFields(format, raw)), body)).toBe(POST);
  });

  it("keeps existing fields in place, appends new ones and removes undefined", () => {
    const f = parseFields("yaml", splitFrontMatter(POST)!.raw);
    applyChanges(f, [
      ["title", "New title"],
      ["tags", ["a", "b"]],
      ["custom_field", undefined],
    ]);
    expect([...f.keys()]).toEqual(["title", "date", "slug", "draft", "categories", "image", "author", "tags"]);
    expect(stringifyFields("yaml", f)).toContain('title: "New title"\n');
    expect(stringifyFields("yaml", f)).toContain('tags: ["a", "b"]');
  });

  it("escapes strings safely", () => {
    const f = new Map<string, unknown>([["title", 'Quote " and: colon\nnewline']]);
    const out = stringifyFields("yaml", f);
    expect(parseFields("yaml", out).get("title")).toBe('Quote " and: colon\nnewline');
  });

  it("writes TOML front matter", () => {
    const f = new Map<string, unknown>([
      ["title", "Hello"],
      ["draft", true],
      ["tags", ["a"]],
    ]);
    const text = stringifyFields("toml", f);
    expect(parseFields("toml", text).get("tags")).toEqual(["a"]);
    expect(text).toContain('title = "Hello"');
  });

  it("makes slugs like the site's existing ones", () => {
    expect(slugify("1.8. Akaa - Kylmäkoski - Urjala - Nuutajärvi - Naantali")).toBe("1-8-akaa-kylmakoski-urjala-nuutajarvi-naantali");
    expect(slugify("  Hello, World!  ")).toBe("hello-world");
    expect(slugify("!!!")).toBe("untitled");
  });

  it("formats dates in the site's time zone with the offset", () => {
    const d = new Date("2026-10-15T11:05:30Z");
    expect(formatDateInZone(d, "Europe/Helsinki")).toBe("2026-10-15T14:05:30+03:00");
    expect(formatDateInZone(new Date("2026-01-15T11:05:30Z"), "Europe/Helsinki")).toBe("2026-01-15T13:05:30+02:00");
    expect(formatDateInZone(d, "UTC")).toBe("2026-10-15T11:05:30+00:00");
    expect(formatDateInZone(d, "America/New_York")).toBe("2026-10-15T07:05:30-04:00");
  });
});

describe("zoned local times", () => {
  it("turns a wall-clock time in the site's zone into a Hugo date", async () => {
    const { zonedLocalToIso } = await import("../../src/shared/frontmatter");
    expect(zonedLocalToIso("2026-10-15T14:05", "Europe/Helsinki")).toBe("2026-10-15T14:05:00+03:00");
    expect(zonedLocalToIso("2026-01-15T09:00", "Europe/Helsinki")).toBe("2026-01-15T09:00:00+02:00");
    expect(zonedLocalToIso("2026-10-15T14:05", "UTC")).toBe("2026-10-15T14:05:00+00:00");
  });
});
