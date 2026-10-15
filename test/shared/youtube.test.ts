import { describe, expect, it } from "vitest";
import { pastedVideo, shortcodeYoutubeId, youtubeId, youtubeShortcode } from "../../src/shared/youtube";

const ID = "dQw4w9WgXcQ";

describe("youtubeId", () => {
  it.each([
    ID,
    ` ${ID} `,
    `https://www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?feature=share&v=${ID}&t=42s`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}&list=x`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abc&t=10`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/live/${ID}?feature=share`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `youtube.com/watch?v=${ID}`,
    `youtu.be/${ID}`,
    `http://youtube.com/watch?v=${ID}`,
  ])("accepts %s", (input) => {
    expect(youtubeId(input)).toBe(ID);
  });

  it.each([
    "",
    "dQw4w9WgXc",
    "dQw4w9WgXcQQ",
    `https://example.com/watch?v=${ID}`,
    `https://youtube.com.evil.example/watch?v=${ID}`,
    `https://www.youtube.com/watch?v=bad`,
    `https://www.youtube.com/@channel`,
    `javascript:alert(1)//${ID}`,
    "not a link",
  ])("rejects %s", (input) => {
    expect(youtubeId(input)).toBeNull();
  });
});

describe("shortcodes", () => {
  it("writes Hugo's youtube shortcode", () => {
    expect(youtubeShortcode(ID)).toBe(`{{< youtube ${ID} >}}`);
  });

  it.each([`{{< youtube ${ID} >}}`, `{{< youtube id="${ID}" >}}`, `{{< youtube id="${ID}" loading="lazy" >}}`, `{{% youtube "${ID}" %}}`])("reads %s", (line) => {
    expect(shortcodeYoutubeId(line)).toBe(ID);
  });

  it("ignores other shortcodes", () => {
    expect(shortcodeYoutubeId(`{{< vimeo ${ID} >}}`)).toBeNull();
  });
});

describe("pastedVideo", () => {
  const link = `https://youtu.be/${ID}?si=x`;
  const code = `{{< youtube ${ID} >}}`;

  it("converts a link pasted on an empty line", () => {
    expect(pastedVideo(link, "", "")).toBe(code);
    expect(pastedVideo(` ${link}\n`, "Text\n\n", "\n\nMore")).toBe(code);
  });

  it("keeps the shortcode apart from neighbouring text", () => {
    expect(pastedVideo(link, "Text\n", "\nMore")).toBe(`\n${code}\n`);
  });

  it("leaves links inside text, bare IDs and other links alone", () => {
    expect(pastedVideo(link, "See ", "")).toBeNull();
    expect(pastedVideo(link, "", " here")).toBeNull();
    expect(pastedVideo(ID, "", "")).toBeNull();
    expect(pastedVideo("https://example.com/", "", "")).toBeNull();
    expect(pastedVideo(`${link} ${link}`, "", "")).toBeNull();
  });
});
