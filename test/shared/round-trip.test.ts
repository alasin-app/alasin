import { describe, expect, it } from "vitest";
import { parseDraft, prepareSave } from "../../src/web/lib/draft-model";
import { roundTrip } from "../../src/web/lib/round-trip";
import type { SiteSettings } from "../../src/web/lib/site-types";

const site = { frontMatterFormat: "yaml", coverField: "image", authorField: "author", authorIdField: "author_id", author: null, login: "", users: [], categories: [] } as unknown as SiteSettings;

// Posts written by hand or by other tools, in the shapes Hugo sites have.
const SAMPLES: Record<string, string> = {
  "YAML with unusual formatting": `---
title:   'Single quotes and   spaces'
date: 2019-08-02T22:54:16+03:00
lastmod: 2021-07-31T17:00:10+03:00
categories:
  - travel
  - summer-2019
tags: [a, "b c"]
url: "/2019/08/02/slug/"
draft: false
custom:
  nested: true
# a comment in the front matter
legacy_id: 1566
---

Text with a hard break at the end of a paragraph:  

Next paragraph.
`,
  "TOML front matter": `+++
title = "TOML post"
date = 2026-01-02T03:04:05Z
tags = ["x"]
[params]
hero = true
+++

Body.
`,
  "Markdown the tidy-up would otherwise touch": `---
title: "Lists and quotes"
---

- item
-

1. first
2.

>

> quoted
>
> still quoted

Setext heading
-

    indented code  

\`\`\`
-
>  
\`\`\`
`,
  "shortcodes, HTML and no trailing newline": `---
title: "Shortcodes"
---
{{< gallery >}}

![](/img/2020/01/01/a.jpg "Caption")

![](/img/2020/01/01/b.jpg)

{{< /gallery >}}

{{< youtube dQw4w9WgXcQ >}}

<div class="note">raw <b>HTML</b></div>
Last line without newline`,
  "no blank line after the front matter": `---
title: "Tight"
---
Starts right away.
`,
  "empty body": `---
title: "Only front matter"
---
`,
};

describe("round trip: opening and saving without changes", () => {
  for (const [name, text] of Object.entries(SAMPLES)) {
    it(`gives back the same file: ${name}`, () => {
      expect(roundTrip(text, site)).toEqual({ ok: true });
    });
  }

  it("still tidies what was typed since the last save", () => {
    const saved = SAMPLES["YAML with unusual formatting"]!;
    const doc = parseDraft(saved, site)!;
    doc.form.body = `${doc.form.body}\n- new item\n-\n\nNew paragraph.  \n`;
    const { content } = prepareSave(doc, site, { rich: true, saved });
    expect(content).toContain("Text with a hard break at the end of a paragraph:  \n");
    expect(content).toContain("- new item\n\nNew paragraph.\n");
  });

  it("changes only the edited field's line in an existing file", () => {
    const text = SAMPLES["YAML with unusual formatting"]!;
    const doc = parseDraft(text, site)!;
    doc.form.title = "New title";
    doc.form.categories = ["travel"];
    const { content } = prepareSave(doc, site, { rich: true, saved: text, draft: false });
    const a = text.split("\n");
    const b = content.split("\n");
    expect(b[1]).toBe('title: "New title"');
    // The block list became one line; everything else is as it was.
    expect(content.replace('title: "New title"', "title:   'Single quotes and   spaces'").replace('categories: ["travel"]', "categories:\n  - travel\n  - summer-2019")).toBe(text);
    expect(a.length - b.length).toBe(2);
    expect(content).toContain("# a comment in the front matter");
    expect(content).not.toContain("draft: true");
  });

  it("changes TOML front matter line by line too, with dates unquoted", () => {
    const text = SAMPLES["TOML front matter"]!;
    const doc = parseDraft(text, site)!;
    doc.form.tags = ["y", "z"];
    doc.form.date = "2026-02-03T04:05:06Z";
    const { content } = prepareSave(doc, site, { rich: true, saved: text, draft: false });
    expect(content).toBe(text.replace('tags = ["x"]', 'tags = [ "y", "z" ]').replace("date = 2026-01-02T03:04:05Z", "date = 2026-02-03T04:05:06Z"));
  });

  it("reports where a file would change", () => {
    const result = roundTrip("no front matter here\n", site);
    expect(result).toMatchObject({ ok: false, reason: "no front matter" });
  });
});
