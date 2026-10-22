// SPDX-License-Identifier: MIT
//
// alasin.toml and sites/<id>.toml as text (#325): which sections are a site's
// own, and splitting a one-site alasin.toml in two while keeping its comments.
// Files made from alasin.example.toml mark each section with a banner:
//
//     # -----------------------------------------------------------------------------
//     # [media] - …
//     # -----------------------------------------------------------------------------
//
// which is where they're split. No Node APIs, so tests can use it anywhere.

/** Sections that are a site's own; everything else in alasin.toml every site shares. */
export const SITE_SECTIONS = ["site", "github", "media", "drafts", "archive", "bin", "images", "editor", "categories", "preview"];
/** [github] keys of a site; the others (the GitHub App) every site shares. */
const SITE_GITHUB_KEYS = ["owner", "repo", "branch", "installation_id"];
const APP_GITHUB_KEYS = ["app_id", "client_id"];

/** Whether `table.key` is a site's own value (in sites/<id>.toml), not one every site shares. */
export const isSiteValue = (table: string, key: string) => SITE_SECTIONS.includes(table) && !(table === "github" && APP_GITHUB_KEYS.includes(key));

/** A site id suggested from its repository's name: lower-case, hyphens for other characters. */
export function suggestSiteId(repo: string): string {
  return repo.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "site";
}

const SITE_HEADER = `# sites/<id>.toml - one site of an Alasin deployment
#
# The site's own settings. alasin.toml, next to the sites/ folder, has what
# every site shares ([app], [ui], [security] and the GitHub App), and can hold
# defaults for every site. The file name is the site's id: it starts the app's
# addresses for the site (/<id>/...) and names its buckets in wrangler.toml
# (MEDIA_<ID> and DRAFTS_<ID>). Every option is described in alasin.example.toml.
`;

interface Block {
  /** The section a banner names ("media", "env.<name>"); null before the first banner. */
  name: string | null;
  text: string;
}

const BANNER_RULE = /^# -{10,}\s*$/;
const BANNER_NAME = /^# \[([A-Za-z_.<>-]+)\]/;

function blocks(text: string): Block[] {
  const lines = text.split("\n");
  const out: Block[] = [{ name: null, text: "" }];
  const current: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const name = BANNER_RULE.test(lines[i]!) ? BANNER_NAME.exec(lines[i + 1] ?? "")?.[1] : undefined;
    if (name) {
      out[out.length - 1]!.text = current.splice(0).join("\n");
      out.push({ name, text: "" });
    }
    current.push(lines[i]!);
  }
  out[out.length - 1]!.text = current.join("\n");
  return out;
}

/** A section without the paragraphs (separated by blank lines) that set, or show commented out, one of `keys`. */
function withoutKeys(text: string, keys: string[]): string {
  const key = new RegExp(`^#?\\s*(?:${keys.join("|")})\\s*=`);
  return text
    .split(/\n(?:[ \t]*\n)+/)
    .filter((p) => !p.split("\n").some((l) => key.test(l.trim())) || p.split("\n").some((l) => /^\s*\[/.test(l)))
    .join("\n\n");
}

const tidy = (parts: string[]) => `${parts.map((p) => p.replace(/\s+$/, "")).filter(Boolean).join("\n\n\n")}\n`;

/**
 * A one-site alasin.toml split into what every site shares (`app`) and the
 * site's own sections (`site`, for sites/<id>.toml), with their comments.
 * Null if the file has no section banners to split it at.
 */
export function splitSiteConfig(text: string): { app: string; site: string } | null {
  const all = blocks(text);
  if (!all.some((b) => b.name === "site") || !all.some((b) => b.name === "github")) return null;
  const app: string[] = [];
  const site: string[] = [SITE_HEADER];
  for (const b of all) {
    if (b.name === "github") {
      app.push(withoutKeys(b.text, SITE_GITHUB_KEYS));
      site.push(withoutKeys(b.text, APP_GITHUB_KEYS));
    } else if (b.name && SITE_SECTIONS.includes(b.name)) site.push(b.text);
    else app.push(b.text);
  }
  return { app: tidy(app), site: tidy(site) };
}

/** A site file to fill in: the site's sections of alasin.example.toml. */
export function siteTemplate(exampleText: string): string {
  const split = splitSiteConfig(exampleText);
  if (!split) throw new Error("alasin.example.toml has no section banners");
  return split.site;
}

/** wrangler.toml with the one site's MEDIA and DRAFTS bindings named for the site with id `id`. */
export function renameBucketBindings(text: string, media: string, drafts: string): string {
  return text.replace(/^(\s*binding\s*=\s*)"MEDIA"/gm, `$1"${media}"`).replace(/^(\s*binding\s*=\s*)"DRAFTS"/gm, `$1"${drafts}"`);
}
