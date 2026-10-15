import { describe, expect, it } from "vitest";
import type { ContentItem } from "../../src/web/lib/content-index";
import { createSearch, fold, snippet } from "../../src/web/lib/search";

const item = (path: string, title: string, text: string, tags: string[] = []): ContentItem => ({
  path, sha: "", kind: "post", state: "published", title, date: "", time: NaN, slug: "", categories: [], tags, text,
});

const items = [
  item("a", "Kesäloma Norjassa", "Ajoimme vuonoille ja yövyimme leirintäalueella."),
  item("b", "Sauna", "Uusi kiuas lämpenee nopeasti. Kesäloma alkaa pian."),
  item("c", "Radio", "Antenna on the roof.", ["qrp"]),
];

describe("search", () => {
  const search = createSearch(items);

  it("ignores case and diacritics, and ranks titles first", () => {
    expect(search.find("kesaloma")).toEqual(["a", "b"]);
    expect(search.find("KESÄLOMA")).toEqual(["a", "b"]);
  });

  it("matches partly typed words, small typos and tags", () => {
    expect(search.find("leirinta")).toEqual(["a"]);
    expect(search.find("antena")).toEqual(["c"]);
    expect(search.find("qrp")).toEqual(["c"]);
    expect(search.find("")).toEqual([]);
  });

  it("needs every word to match", () => {
    expect(search.find("kesaloma kiuas")).toEqual(["b"]);
  });

  it("makes a highlighted snippet around the first match", () => {
    expect(fold("Öljy")).toBe("oljy");
    const s = snippet("Uusi kiuas lämpenee nopeasti. Kesäloma alkaa pian.", "kesaloma")!;
    expect(s.filter((p) => p.match).map((p) => p.text)).toEqual(["Kesäloma"]);
    expect(s.map((p) => p.text).join("")).toBe("Uusi kiuas lämpenee nopeasti. Kesäloma alkaa pian.");
    expect(snippet("No match here", "kesaloma")).toBeNull();
  });
});
