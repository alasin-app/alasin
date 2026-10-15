// SPDX-License-Identifier: MIT
//
// Schema of `alasin.toml`. This is the single source of truth for every option:
// the Worker validates its configuration against it at startup, `npm run setup`
// and `npm run build` validate the file before deploying, and the README's
// configuration reference is generated from the descriptions here.

import { z } from "zod";

const httpsOrLocalUrl = z
  .url({ protocol: /^https?$/ })
  .refine((u) => u.startsWith("https://") || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(u), {
    message: "must use https:// (http:// is only allowed for localhost)",
  });

/** Origin only (scheme, host, optional port), no path. */
const origin = httpsOrLocalUrl.refine((u) => new URL(u).pathname === "/" && !u.includes("?") && !u.includes("#"), {
  message: "must be an origin without a path, e.g. https://alasin.example.com",
});

/** Repository-relative directory, e.g. `content/posts`. */
const repoDir = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith("/") && !p.endsWith("/") && !p.split("/").some((s) => s === ".." || s === "." || s === ""), {
    message: "must be a relative path inside the repository, without leading or trailing slashes or '..'",
  });

const ghName = z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})$/, "is not a valid GitHub owner or repository name");

const app = z
  .object({
    url: origin.describe(
      "Canonical public origin of this Alasin deployment. Used for the OAuth callback (`<url>/auth/callback`, which must match the GitHub App), the CSRF `Origin` check and redirects from other hostnames.",
    ),
  })
  .strict()
  .describe("The Alasin deployment itself.");

const site = z
  .object({
    url: httpsOrLocalUrl.describe("Public URL of the Hugo site for the configured branch, used for “View on site” links."),
    posts_dir: repoDir.default("content/posts").describe("Directory of posts in the site repository."),
    pages_dir: repoDir.default("content/pages").describe("Directory of pages in the site repository."),
    post_filename: z
      .string()
      .default("{slug}.md")
      .describe(
        "File name pattern for new posts, relative to `posts_dir`. Placeholders: `{slug}`, `{yyyy}`, `{mm}`, `{dd}`. Must end in `.md`.",
      )
      .refine((s) => s.endsWith(".md") && !s.includes(".."), { message: "must end in .md and must not contain '..'" }),
    page_filename: z
      .string()
      .default("{slug}.md")
      .describe("File name pattern for new pages, relative to `pages_dir`. Placeholder: `{slug}`. Must end in `.md`.")
      .refine((s) => s.endsWith(".md") && !s.includes(".."), { message: "must end in .md and must not contain '..'" }),
    front_matter_format: z
      .enum(["yaml", "toml"])
      .default("yaml")
      .describe("Front matter format for new files. Existing files keep the format they already use."),
    timezone: z
      .string()
      .default("UTC")
      .describe("IANA time zone used for the date of new posts, e.g. `Europe/Helsinki`. Usually matches Hugo's `timeZone`."),
  })
  .strict()
  .describe("The Hugo site and its content layout.");

const github = z
  .object({
    owner: ghName.describe("Owner (user or organisation) of the site repository."),
    repo: ghName.describe("Name of the site repository."),
    branch: z.string().min(1).default("main").describe("Branch Alasin reads from and commits to."),
    app_id: z.number().int().positive().describe("ID of the GitHub App used for login. Filled in by `npm run setup`."),
    client_id: z.string().min(1).describe("Client ID of the GitHub App. Filled in by `npm run setup`."),
    installation_id: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Installation ID of the GitHub App on the site repository, used by the daily cleanup. Filled in by `npm run setup`."),
  })
  .strict()
  .describe("The site repository and the GitHub App used to log in. Secrets go in Worker secrets, never here.");

const allowedUser = z.strictObject({
  login: z.string().min(1).describe("GitHub username, for readability. Not used for access checks."),
  id: z.number().int().positive().describe("Numeric GitHub user ID; this is what access is checked against."),
});

const users = z
  .object({
    allow: z
      .array(allowedUser)
      .min(1, "list at least one user")
      .describe("GitHub users allowed to log in. `npm run setup` resolves usernames to numeric IDs."),
  })
  .strict()
  .describe("Who may log in.");

const media = z
  .object({
    public_url: httpsOrLocalUrl
      .refine((u) => u.endsWith("/"), { message: "must end with a slash" })
      .describe("Public base URL of the `MEDIA` bucket, ending in `/`. Its origin is added to the Content-Security-Policy."),
    path_pattern: z
      .string()
      .default("{yyyy}/{mm}/{dd}/{name}.{ext}")
      .describe(
        "R2 key pattern for published images. Placeholders: `{yyyy}`, `{mm}`, `{dd}` (from the post date), `{name}` (the original file name, lower-cased and URL-safe; `-2`, `-3`… is added only if that name is already taken), `{ext}` (from the image type). Must match the bucket's existing layout.",
      )
      .refine((p) => p.includes("{name}") && !p.startsWith("/") && !p.includes(".."), {
        message: "must contain {name}, must not start with '/' and must not contain '..'",
      }),
    content_prefix: z
      .string()
      .default("/img/")
      .describe(
        "How Markdown refers to published images: this prefix followed by the R2 key. Use the site's own convention, e.g. `/img/` when a render hook maps it to the media domain, or the full `public_url`.",
      ),
    cache_control: z
      .string()
      .default("public, max-age=604800")
      .describe("`Cache-Control` header set on images copied to `MEDIA`."),
    browse_prefixes: z
      .array(z.string())
      .default([""])
      .describe("Top-level prefixes of `MEDIA` the media browser may list. `\"\"` means the bucket root."),
  })
  .strict()
  .describe("The site's existing public image bucket (`MEDIA` binding). Alasin never overwrites or deletes objects there.");

const drafts = z
  .object({
    dir: repoDir
      .default("drafts")
      .describe(
        "Directory in the site repository where draft posts and pages are committed until they are published. Must be outside Hugo's content directory, so drafts are never built. Draft images go to the `DRAFTS` R2 bucket, never into git.",
      ),
  })
  .strict()
  .describe("Unpublished drafts: their text is committed to the site repository, their images go to R2.");

const images = z
  .object({
    accepted_types: z
      .array(z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]))
      .default(["image/jpeg", "image/png", "image/webp", "image/gif"])
      .describe("Image types users may upload. SVG is never accepted. HEIC is converted in the browser."),
    max_upload_mb: z.number().positive().max(100).default(25).describe("Maximum size of one uploaded file, in MB."),
    site_config_file: z
      .string()
      .optional()
      .describe(
        "TOML file in the site repository that defines image sizes, shared with the site's own tooling, e.g. `config/_default/params.toml`. Values found there override the ones below.",
      ),
    widths_key: z.string().default("imageWidths").describe("Key in `site_config_file` holding the variant widths."),
    quality_key: z.string().default("imageQuality").describe("Key in `site_config_file` holding the variant quality."),
    max_size_key: z.string().default("imageMaxSize").describe("Key in `site_config_file` holding the main image's longest side."),
    widths: z.array(z.number().int().positive()).default([480, 960, 1600]).describe("Widths of the resized variants, in pixels."),
    variant_format: z.enum(["webp", "jpeg"]).default("webp").describe("Format of the resized variants."),
    variant_name: z
      .string()
      .default("{name}-{width}.{ext}")
      .describe("File name of each variant, next to the main image. Placeholders: `{name}`, `{width}`, `{ext}`."),
    quality: z.number().min(1).max(100).default(80).describe("Encoding quality of the variants (1–100)."),
    max_size: z.number().int().positive().default(2560).describe("Longest side of the main image, in pixels."),
    main_quality: z.number().min(1).max(100).default(85).describe("JPEG quality of the main image (1–100)."),
    keep_exif: z
      .boolean()
      .default(false)
      .describe("Keep EXIF metadata (camera, date) in the main image. GPS location is always removed."),
  })
  .strict()
  .describe("Automatic resizing in the browser.");

const editor = z
  .object({
    lock_heartbeat_seconds: z.number().int().min(10).max(600).default(60).describe("How often an open editor renews its lock."),
    lock_expiry_seconds: z
      .number()
      .int()
      .min(30)
      .max(3600)
      .default(180)
      .describe("How long a lock lasts without renewal (closed tab, lost connection). Must be longer than the heartbeat."),
    gallery_shortcode: z.string().regex(/^[A-Za-z0-9_-]+$/).default("gallery").describe("Name of the site's gallery shortcode."),
    gallery_paired: z
      .boolean()
      .default(true)
      .describe("`true` if the gallery wraps Markdown images (`{{< gallery >}} … {{< /gallery >}}`)."),
  })
  .strict()
  .describe("Editor behaviour.");

const categories = z
  .object({
    storage: z
      .enum(["term-pages", "data-file", "front-matter"])
      .default("term-pages")
      .describe(
        "Where the category list lives: `term-pages` (`<dir>/<slug>/_index.md`), `data-file` (a TOML/YAML file listing them) or `front-matter` (only the values used in posts).",
      ),
    path: z.string().default("content/categories").describe("Directory of term pages, or path of the data file."),
  })
  .strict()
  .describe("Categories.");

const preview = z
  .object({
    css_url: httpsOrLocalUrl.optional().describe("Stylesheet of the site's theme used in the preview. Its origin is allowed by the CSP."),
  })
  .strict()
  .describe("Preview styling.");

const ui = z
  .object({
    name: z.string().min(1).max(40).default("Alasin").describe("App name shown to users."),
    accent_color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default("#007AFF")
      .describe("Accent colour as `#rrggbb`. Defaults to iOS system blue."),
    environment_label: z
      .string()
      .max(12)
      .optional()
      .describe("Badge shown in the app for non-production deployments, e.g. `DEV`. Leave unset in production."),
    default_language: z.enum(["en", "fi"]).default("en").describe("Default UI language. Users can change it in the app."),
  })
  .strict()
  .describe("What users see.");

const security = z
  .object({
    session_idle_days: z.number().positive().max(90).default(7).describe("Log out after this many days without activity."),
    session_max_days: z.number().positive().max(365).default(30).describe("Log out this many days after login, regardless of activity."),
  })
  .strict()
  .describe("Sessions. Rate limits are set in `wrangler.toml` (`[[ratelimits]]`).");

export const configSchema = z
  .object({
    app,
    site,
    github,
    users,
    media,
    drafts: drafts.prefault({}),
    images: images.prefault({}),
    editor: editor.prefault({}),
    categories: categories.prefault({}),
    preview: preview.prefault({}),
    ui: ui.prefault({}),
    security: security.prefault({}),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.editor.lock_expiry_seconds <= c.editor.lock_heartbeat_seconds) {
      ctx.addIssue({
        code: "custom",
        path: ["editor", "lock_expiry_seconds"],
        message: "must be longer than editor.lock_heartbeat_seconds",
      });
    }
    if (c.security.session_idle_days > c.security.session_max_days) {
      ctx.addIssue({
        code: "custom",
        path: ["security", "session_idle_days"],
        message: "must not be longer than security.session_max_days",
      });
    }
    const inside = (dir: string, parent: string) => dir === parent || dir.startsWith(`${parent}/`) || parent.startsWith(`${dir}/`);
    for (const key of ["posts_dir", "pages_dir"] as const) {
      if (inside(c.drafts.dir, c.site[key])) {
        ctx.addIssue({
          code: "custom",
          path: ["drafts", "dir"],
          message: `must be outside site.${key} ("${c.site[key]}"), or Hugo would publish drafts`,
        });
      }
    }
    if (c.drafts.dir === "content" || c.drafts.dir.startsWith("content/")) {
      ctx.addIssue({ code: "custom", path: ["drafts", "dir"], message: "must be outside Hugo's content directory" });
    }
    const ids = new Set<number>();
    c.users.allow.forEach((u, i) => {
      if (ids.has(u.id)) ctx.addIssue({ code: "custom", path: ["users", "allow", i, "id"], message: "is listed twice" });
      ids.add(u.id);
    });
  });

export type AlasinConfig = z.output<typeof configSchema>;
export type AlasinConfigInput = z.input<typeof configSchema>;

export class ConfigError extends Error {
  constructor(
    message: string,
    readonly issues: string[],
  ) {
    super(message);
    this.name = "ConfigError";
  }
}

/** Human-readable issue list: `github.app_id: Invalid input: expected number, received string`. */
export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((i) => {
    const path = i.path.map((p) => (typeof p === "number" ? `[${p}]` : String(p))).join(".").replace(/\.\[/g, "[");
    return `${path || "(top level)"}: ${i.message}`;
  });
}

/**
 * Validates a parsed configuration. `source` names the file in error messages.
 * Throws ConfigError listing every problem.
 */
export function parseConfig(input: unknown, source = "alasin.toml"): AlasinConfig {
  const result = configSchema.safeParse(input);
  if (!result.success) {
    const issues = formatIssues(result.error);
    throw new ConfigError(
      `${source} is not valid:\n${issues.map((i) => `  - ${i}`).join("\n")}\nSee alasin.example.toml for every option, its type and an example.`,
      issues,
    );
  }
  return result.data;
}

type Mergeable = Record<string, unknown>;

function isPlainObject(v: unknown): v is Mergeable {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Deep-merges tables; arrays and scalars in `override` replace the base value. */
export function deepMerge(base: Mergeable, override: Mergeable): Mergeable {
  const out: Mergeable = { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k] as Mergeable, v) : v;
  }
  return out;
}

/**
 * Applies an `[env.<name>]` override table and removes the `env` table.
 * Without an environment name, the top-level values are used as they are.
 */
export function selectEnvironment(raw: Mergeable, envName: string | undefined): Mergeable {
  const { env, ...base } = raw;
  if (!envName) return base;
  const envs = isPlainObject(env) ? env : {};
  const override = envs[envName];
  if (override === undefined) return base;
  if (!isPlainObject(override)) throw new ConfigError(`[env.${envName}] must be a table`, [`env.${envName}: must be a table`]);
  return deepMerge(base, override);
}
