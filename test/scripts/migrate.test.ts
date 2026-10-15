// SPDX-License-Identifier: MIT
import { parse } from "smol-toml";
import { describe, expect, it } from "vitest";
import { migrateAlasinToml } from "../../scripts/lib/migrate";
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
  const start = currentExample.indexOf("# ─────────────────────────────────────────────────────────────────────────────\n# [drafts]");
  const end = currentExample.indexOf("# ─────────────────────────────────────────────────────────────────────────────\n# [images]");
  return currentExample.slice(0, start) + V090_DRAFTS + "\n\n" + currentExample.slice(end) + extra;
}

describe("alasin.toml migration", () => {
  it("upgrades a 0.9.0 [drafts] section to a valid configuration", () => {
    const old = withOldDrafts();
    expect(() => parseConfig(selectEnvironment(parse(old) as Record<string, unknown>, undefined))).toThrow(/storage/);
    const { text, changes } = migrateAlasinToml(old);
    expect(changes).toHaveLength(2);
    const config = parseConfig(selectEnvironment(parse(text) as Record<string, unknown>, undefined));
    expect(config.drafts.dir).toBe("unpublished");
    expect(text).not.toMatch(/storage = "r2"|repo_dir|Both options are server-side/);
    expect(text).toContain("# Folder for drafts in the site repository.");
    expect(text).toContain("# Drafts are committed to the site repository");
    // Everything outside [drafts] is untouched.
    expect(text.slice(0, text.indexOf("# [drafts]"))).toBe(old.slice(0, old.indexOf("# [drafts]")));
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
      const start = text.indexOf(`# ─────────────────────────────────────────────────────────────────────────────\n# [${name}]`);
      const next = text.indexOf("# ─────────────────────────────────────────────────────────────────────────────\n# [", start + 10);
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
    expect(text.indexOf("\n[security]\n")).toBeLessThan(text.indexOf("# [env.<name>] —"));
    expect(text.match(/# \[env\.<name>\] —/g)).toHaveLength(1);
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


describe("removed [users] author", () => {
  it("drops author from the users, keeping everything else", () => {
    const old = `[users]
# \`author\` (optional) is written to new posts' author field (see [site] author_field).
# Type: array of { login = string, id = integer, author = string }. Required, at least one.
allow = [
  { login = "octocat", id = 583231, author = "Mona Lisa", aliases = ["Mona"] },
  { author = "Jane", login = "jane", id = 2 },
  { login = "plain", id = 3 },
]

[env.dev.users]
allow = [{ login = "octocat", id = 583231, author = 'Octo' }]
`;
    const { text, changes } = migrateAlasinToml(old);
    expect(changes).toEqual([
      '[users]: removed "author" from users (full names now come from GitHub profiles)',
      '[env.dev.users]: removed "author" from users (full names now come from GitHub profiles)',
    ]);
    expect(text).toContain('  { login = "octocat", id = 583231, aliases = ["Mona"] },\n  { login = "jane", id = 2 },\n  { login = "plain", id = 3 },');
    expect(text).toContain('allow = [{ login = "octocat", id = 583231 }]');
    expect(text).not.toContain("author = string");
    expect(text).toContain("full name is taken from their GitHub profile");
    expect(() => parse(text)).not.toThrow();
  });
});
