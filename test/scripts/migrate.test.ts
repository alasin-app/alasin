// SPDX-License-Identifier: MIT
import { parse } from "smol-toml";
import { describe, expect, it } from "vitest";
import { migrateAlasinToml, plainComments } from "../../scripts/lib/migrate";
import wranglerExample from "../../wrangler.example.toml?raw";
import { parseConfig, selectEnvironment } from "../../src/shared/config/schema";
import currentExample from "../../alasin.example.toml?raw";

// The [drafts] section as alasin.example.toml shipped it in 0.9.0.
const V090_DRAFTS = `# ─────────────────────────────────────────────────────────────────────────────
# [drafts] — unpublished drafts.
# ─────────────────────────────────────────────────────────────────────────────
#
# Draft IMAGES always go to the private DRAFTS bucket. This decides where draft
# TEXT lives. Both options are server-side, so a draft started on the phone can
# be finished on the laptop.
[drafts]

# "r2":   draft text is kept in the private DRAFTS bucket and never enters git
#         until you publish. Safe for public repositories.
# "repo": draft text is committed to repo_dir in the site repository, with
#         version history. WARNING: anyone who can read the repository can read
#         the drafts — use it with a private repository.
# Type: string. Default: "r2".
storage = "r2"

# With storage = "repo": directory for draft files in the site repository.
# Must be outside Hugo's content directory, so Hugo never builds drafts.
# Tip: exclude it from your site's build triggers (Cloudflare Workers Builds:
# Settings → Build → Build watch paths) so saving a draft doesn't rebuild the site.
# Type: string. Default: "drafts".
repo_dir = "unpublished"
`;

function withOldDrafts(extra = ""): string {
  const start = currentExample.indexOf("# -----------------------------------------------------------------------------\n# [drafts]");
  const end = currentExample.indexOf("# -----------------------------------------------------------------------------\n# [images]");
  return currentExample.slice(0, start) + V090_DRAFTS + "\n\n" + currentExample.slice(end) + extra;
}

describe("alasin.toml migration", () => {
  it("upgrades a 0.9.0 [drafts] section to a valid configuration", () => {
    const old = withOldDrafts();
    expect(() => parseConfig(selectEnvironment(parse(old) as Record<string, unknown>, undefined))).toThrow(/storage/);
    const { text, changes } = migrateAlasinToml(old);
    // The two [drafts] changes, and its old-style comments in plain ASCII.
    expect(changes).toHaveLength(3);
    const config = parseConfig(selectEnvironment(parse(text) as Record<string, unknown>, undefined));
    expect(config.drafts.dir).toBe("unpublished");
    expect(text).not.toMatch(/storage = "r2"|repo_dir|Both options are server-side/);
    expect(text).toContain("# Folder for drafts in the site repository.");
    expect(text).toContain("# Drafts are committed to the site repository");
    // Everything outside [drafts] is untouched, apart from plain ASCII comments.
    const plainOld = plainComments(old);
    expect(text.slice(0, text.indexOf("# [drafts]"))).toBe(plainOld.slice(0, plainOld.indexOf("# [drafts]")));
  });

  it("migrates environment tables too", () => {
    const { text, changes } = migrateAlasinToml('[app]\nurl = "x"\n\n[env.dev.drafts]\nstorage = "repo"\nrepo_dir = "drafts"\n');
    expect(changes).toEqual([
      '[env.dev.drafts]: removed "storage" (drafts are now always kept in the site repository)',
      '[env.dev.drafts]: renamed "repo_dir" to "dir"',
    ]);
    expect(parse(text)).toEqual({ app: { url: "x" }, env: { dev: { drafts: { dir: "drafts" } } } });
  });

  it("removes the old [site] timezone option", () => {
    const old = currentExample.replace(
      'front_matter_format = "yaml"\n',
      'front_matter_format = "yaml"\n\n# IANA time zone for the date of new posts; usually Hugo\'s `timeZone`.\n# Type: string. Default: "UTC". Example: "Europe/Helsinki"\ntimezone = "Europe/Helsinki"\n',
    );
    expect(old).toContain("timezone =");
    const { text, changes } = migrateAlasinToml(old);
    expect(changes).toEqual(['[site]: removed "timezone" (dates are now stored in UTC and shown in each browser\'s time zone)']);
    expect(text).toBe(currentExample);
    expect(() => parseConfig(selectEnvironment(parse(text) as Record<string, unknown>, undefined))).not.toThrow();
  });

  it("leaves a current file unchanged", () => {
    const { text, changes } = migrateAlasinToml(currentExample);
    expect(changes).toEqual([]);
    expect(text).toBe(currentExample);
  });
});

describe("adding sections new in alasin.example.toml", () => {
  /** The example without the given sections (banner, comments and values). */
  function without(names: string[]): string {
    let text = currentExample;
    for (const name of names) {
      const start = text.indexOf(`# -----------------------------------------------------------------------------\n# [${name}]`);
      const next = text.indexOf("# -----------------------------------------------------------------------------\n# [", start + 10);
      text = text.slice(0, start) + text.slice(next);
    }
    return text;
  }
  const config = (text: string) => parseConfig(selectEnvironment(parse(text) as Record<string, unknown>, undefined));

  it("restores missing sections exactly as the example has them, in place", () => {
    const old = without(["archive", "bin"]);
    const { text, changes } = migrateAlasinToml(old, currentExample);
    expect(changes).toEqual([
      "added [archive] from alasin.example.toml (defaults; no change in behaviour)",
      "added [bin] from alasin.example.toml (defaults; no change in behaviour)",
    ]);
    expect(text).toBe(currentExample);
  });

  it("adds a missing last section before the [env.*] tables and keeps them", () => {
    const old = `${without(["security"]).trimEnd()}\n\n[env.dev.app]\nurl = "https://dev.example.com"\n`;
    const { text } = migrateAlasinToml(old, currentExample);
    expect(text.indexOf("\n[security]\n")).toBeGreaterThan(text.indexOf("\n[ui]\n"));
    expect(text.indexOf("\n[security]\n")).toBeLessThan(text.indexOf("\n[env.dev.app]\n"));
    expect(text.endsWith('[env.dev.app]\nurl = "https://dev.example.com"\n')).toBe(true);
    // Also before the commented [env.<name>] introduction.
    expect(text.indexOf("\n[security]\n")).toBeLessThan(text.indexOf("# [env.<name>] -"));
    expect(text.match(/# \[env\.<name>\] -/g)).toHaveLength(1);
  });

  it("never changes what the configuration means: every optional section's example values are its defaults", () => {
    const optional = ["drafts", "archive", "bin", "images", "editor", "categories", "preview", "ui", "security"];
    const old = without(optional);
    const { text, changes } = migrateAlasinToml(old, currentExample);
    expect(changes).toHaveLength(optional.length);
    expect(config(text)).toEqual(config(old));
  });

  it("leaves a complete file alone", () => {
    expect(migrateAlasinToml(currentExample, currentExample)).toEqual({ text: currentExample, changes: [] });
  });
});


describe("removed [users]", () => {
  it("removes [users] and [env.*.users] with their comments, keeping everything else", () => {
    const head = currentExample.slice(0, currentExample.indexOf("# -----------------------------------------------------------------------------\n# [media]"));
    const tail = currentExample.slice(head.length);
    const usersBlock = `# ─────────────────────────────────────────────────────────────────────────────
# [users] — who may log in.
# ─────────────────────────────────────────────────────────────────────────────
#
# WARNING: everyone listed here can publish to the site.
[users]

# Type: array of { login = string, id = integer }.
allow = [
  { login = "octocat", id = 583231, author = "Mona" },
]


`;
    const old = `${head}${usersBlock}${tail.trimEnd()}\n\n[env.dev.users]\nallow = [{ login = "octocat", id = 583231 }]\n\n[env.dev.app]\nurl = "https://dev.example.com"\n`;
    const { text, changes } = migrateAlasinToml(old);
    expect(changes).toEqual([
      "[users]: removed (who can log in now follows write access to the site repository)",
      "[env.dev.users]: removed (who can log in now follows write access to the site repository)",
    ]);
    expect(text).toBe(`${head}${tail.trimEnd()}\n\n[env.dev.app]\nurl = "https://dev.example.com"\n`);
    expect(() => parse(text)).not.toThrow();
  });
});

describe("adding options new in alasin.example.toml to existing sections", () => {
  const cut = (text: string, from: string, to: string) => {
    const a = text.indexOf(from);
    const b = text.indexOf(to, a) + to.length;
    return text.slice(0, a) + text.slice(b);
  };

  it("adds them where the example has them, with their comments, without changing the configuration", () => {
    let old = currentExample;
    // Options added in later versions, as an older file wouldn't have them.
    old = cut(old, "\n# The nightly cleanup removes", 'cleanup_cron = "17 3 * * *"\n');
    old = cut(old, "\n# Front matter field set to the current time", "# page_url = \"/{slug}/\"\n");
    old = cut(old, "\n# Categories can be nested", 'parent_field = "parent"\n');
    old = cut(old, "\n# When the secrets were last rotated", '# github_secrets_rotated = "2026-01-15"\n');
    const { text, changes } = migrateAlasinToml(old, currentExample);
    expect(changes.join("\n")).toContain("[drafts] cleanup_after_days");
    expect(changes.join("\n")).toContain("[site] lastmod_field");
    expect(changes.join("\n")).toContain("the commented-out option [security] github_secrets_rotated");
    expect(text).toBe(currentExample);
  });

  it("never copies an example value of a required option", () => {
    const old = currentExample.replace('url = "https://alasin.example.com"\n', "");
    const { text } = migrateAlasinToml(old, currentExample);
    expect(text).not.toContain('url = "https://alasin.example.com"');
  });

  it("keeps the values a file sets, and adds nothing that would change them", () => {
    const old = currentExample.replace("cleanup_after_days = 7", "cleanup_after_days = 1");
    expect(migrateAlasinToml(old, currentExample)).toEqual({ text: old, changes: [] });
  });
});

describe("plain ASCII comments", () => {
  const ascii = /^[\t\n\r\x20-\x7E]*$/;

  it("the example files are plain ASCII, so any editor shows them right", () => {
    expect(currentExample).toMatch(ascii);
    expect(wranglerExample).toMatch(ascii);
  });

  it("rewrites dashes, arrows and quotes in comments of older files, leaving values alone", () => {
    const text = `# ${"─".repeat(10)}\n# [ui] — what users see → “here”…\n[ui]\nname = "Älä – ok"\n`;
    expect(plainComments(text)).toBe(`# ${"-".repeat(10)}\n# [ui] - what users see -> "here"...\n[ui]\nname = "Älä – ok"\n`);
  });

  it("migrates an older file to plain ASCII comments and reports it", () => {
    const m = migrateAlasinToml(withOldDrafts(), currentExample);
    expect(m.text.split("\n").filter((l) => l.startsWith("#")).join("\n")).toMatch(ascii);
    expect(m.changes.some((c) => c.startsWith("comments:"))).toBe(true);
  });
});

describe("author fields always on", () => {
  // [site] as setup wrote it before 1.0.0-pre.7.
  const OLD_AUTHOR = `# Front matter field for the author's name. New posts and pages get the user's
# full name from their GitHub profile, and the lists show who wrote each one.
# Leave unset if the site doesn't use one.
# Type: string. Optional. Example: "author"
# author_field = "author"

# With author_field set: front matter field for the author's GitHub login, which
# identifies the author (names can change). Alasin shows the author's current
# GitHub name for it, and writes that name to author_field on saving, so that
# field keeps the last known name.
# Type: string. Default: "author_id".
author_id_field = "author_id"`;
  const current = currentExample.slice(currentExample.indexOf("# Front matter field for the author's name"), currentExample.indexOf('author_id_field = "author_id"') + 'author_id_field = "author_id"'.length);
  const old = currentExample.replace(current, OLD_AUTHOR);

  it("turns a commented-out author_field on and brings both descriptions up to date", () => {
    const { text, changes } = migrateAlasinToml(old, currentExample);
    expect(text).toBe(currentExample);
    expect(changes).toEqual([
      '[site]: turned author_field on ("author"); author fields are now always used',
      "[site]: updated the description of author_id_field (author fields are now always used)",
    ]);
  });

  it("keeps a value the file sets, updating only its description", () => {
    const set = old.replace('# author_field = "author"', 'author_field = "writer"');
    const { text } = migrateAlasinToml(set, currentExample);
    expect(text).toBe(currentExample.replace('author_field = "author"', 'author_field = "writer"'));
  });
});
