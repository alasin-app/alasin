import { describe, expect, it } from "vitest";
import { parseConfig } from "../../src/shared/config/schema";
import { contentPath, draftImageRefs, draftInfo, mediaKey, parseDay, publishedText } from "../../src/shared/publish";
import { testConfig } from "../fixtures";

const ID = "01JA2B3C4D5E6F7G8H9JKMNPQR";

describe("publish helpers", () => {
  it("finds each draft image once", () => {
    const text = `![](/api/draft-media/${ID}/a.jpg)\n![](/api/draft-media/${ID}/a.jpg)\nimage: "/api/draft-media/${ID}/b-2.png"`;
    expect(draftImageRefs(text)).toEqual([
      { draftId: ID, file: "a.jpg" },
      { draftId: ID, file: "b-2.png" },
    ]);
    expect(draftImageRefs("/api/draft-media/not-a-ulid/a.jpg")).toEqual([]);
  });

  it("builds media keys and content paths from the configured patterns", () => {
    const day = parseDay("2026-10-05T23:00:00Z")!;
    expect(mediaKey("{yyyy}/{mm}/{dd}/{name}.{ext}", day, "photo", "jpg")).toBe("2026/10/05/photo.jpg");
    const config = parseConfig({ ...testConfig, site: { ...testConfig.site, post_filename: "{yyyy}/{slug}.md" } });
    expect(contentPath(config, "post", "trip", day)).toBe("content/posts/2026/trip.md");
    expect(contentPath(config, "page", "about", day)).toBe("content/pages/about.md");
    expect(parseDay("2026-02-31")).toBeNull();
    expect(parseDay("2026-13-45")).toBeNull();
  });

  it("takes the slug from the draft, or makes one from the title", () => {
    expect(draftInfo(`---\ntitle: "Hei"\nslug: "own"\n---\n`)!.slug).toBe("own");
    expect(draftInfo(`---\ntitle: "Kesä ja Öljy"\nslug: ""\n---\n`)!.slug).toBe("kesa-ja-oljy");
    expect(draftInfo(`---\ntitle: ""\n---\n`)!.slug).toBe("");
  });

  it("writes the published file with public URLs, draft false and no draftId", () => {
    const text = `---\ntitle: "T"\ndraft: true\nweight: 3\ndraftId: "${ID}"\n---\n\n![](/api/draft-media/${ID}/a.jpg)\n`;
    const out = publishedText(text, new Map([[`${ID}/a.jpg`, "/img/2026/10/05/a.jpg"]]));
    expect(out).toBe(`---\ntitle: "T"\ndraft: false\nweight: 3\n---\n\n![](/img/2026/10/05/a.jpg)\n`);
  });

  it("keeps TOML front matter TOML", () => {
    const text = `+++\ntitle = "T"\ndraft = true\ndraftId = "${ID}"\n+++\n\nBody\n`;
    expect(publishedText(text, new Map())).toBe(`+++\ntitle = "T"\ndraft = false\n+++\n\nBody\n`);
  });
});
