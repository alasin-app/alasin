import { describe, expect, it } from "vitest";
import { shortcodeYoutubeId, youtubeId, youtubeShortcode } from "../../src/shared/youtube";

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
