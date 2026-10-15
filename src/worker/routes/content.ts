// SPDX-License-Identifier: MIT
//
// The site's posts and pages for the lists and the search, read in one
// GitHub GraphQL request: the posts, pages, drafts, archive and Bin folders,
// every Markdown file's text and blob SHA, and the branch's head commit (so
// the browser can keep its index until the repository changes).
//
// The Worker forwards GitHub's response without parsing it: building the list
// and the search index happens in the browser, which keeps the Worker well
// inside the Free plan's CPU time even for large sites. Only these folders are
// read, so images or other large files elsewhere in the repository don't
// matter.
//
//   GET  /api/content                the folders (see contentQuery for the shape)
//   GET  /api/content/head           {commit}: the branch's head, to check a cached index
//   GET  /api/content/changes?base=  files changed since a commit (GitHub's compare, unparsed)
//   POST /api/content/files {paths}  the text of some files (GraphQL, unparsed), up to 100
//   POST /api/content/history {paths}  each file's last commit: who and when (GraphQL, unparsed), up to 50
//
// With the last two, a cached index is brought up to date by reading only
// what changed, instead of every file again.

import { type Context, Hono } from "hono";
import { z } from "zod";
import type { AlasinConfig } from "../../shared/config/schema";
import type { AppEnv } from "../app";
import { GitHubError } from "../lib/github";
import { getUserToken } from "../session";

/** Folder levels read below each folder, e.g. bin/content/posts/2026/<slug>/index.md. */
const DEPTH = 6;

function treeFields(depth: number): string {
  const blob = "... on Blob { oid text isBinary isTruncated }";
  if (depth === 0) return `entries { name type object { ${blob} } }`;
  return `entries { name type object { ${blob} ... on Tree { ${treeFields(depth - 1)} } } }`;
}

export const CONTENT_FOLDERS = ["posts", "pages", "drafts", "archive", "bin"] as const;

/** The GraphQL query and its variables: one aliased tree per folder. */
export function contentQuery(config: AlasinConfig): { query: string; variables: Record<string, string> } {
  const { site, drafts, archive, bin, github } = config;
  const dirs: Record<(typeof CONTENT_FOLDERS)[number], string> = {
    posts: site.posts_dir,
    pages: site.pages_dir,
    drafts: drafts.dir,
    archive: archive.dir,
    bin: bin.dir,
  };
  const variables: Record<string, string> = { owner: github.owner, name: github.repo, ref: `refs/heads/${github.branch}` };
  for (const f of CONTENT_FOLDERS) variables[f] = `${github.branch}:${dirs[f]}`;
  const tree = treeFields(DEPTH - 1);
  const query = `query(${["$owner", "$name", "$ref", ...CONTENT_FOLDERS.map((f) => `$${f}`)].map((v) => `${v}: String!`).join(", ")}) {
  repository(owner: $owner, name: $name) {
    ref(qualifiedName: $ref) { target { oid } }
${CONTENT_FOLDERS.map((f) => `    ${f}: object(expression: $${f}) { ... on Tree { ${tree} } }`).join("\n")}
  }
}`;
  return { query, variables };
}

async function graphql(token: string, body: unknown): Promise<Response> {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "Alasin" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new GitHubError(`GraphQL returned ${res.status}`, res.status);
  return res;
}

/** GitHub's response as it is: the browser reads it. */
const forward = (res: Response) =>
  new Response(res.body, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" } });

export const content = new Hono<AppEnv>();

content.get("/", async (c) => {
  const res = await graphql(await getUserToken(c), contentQuery(c.get("config")));
  return forward(res);
});

content.get("/head", async (c) => {
  const { github } = c.get("config");
  const res = await graphql(await getUserToken(c), {
    query: "query($owner: String!, $name: String!, $ref: String!) { repository(owner: $owner, name: $name) { ref(qualifiedName: $ref) { target { oid } } } }",
    variables: { owner: github.owner, name: github.repo, ref: `refs/heads/${github.branch}` },
  });
  const data = (await res.json()) as { data?: { repository?: { ref?: { target?: { oid?: string } } | null } | null } };
  const commit = data.data?.repository?.ref?.target?.oid;
  if (!commit) throw new GitHubError(`branch ${github.branch} not found`, 404);
  return c.json({ commit });
});

const SHA = /^[0-9a-f]{40}$/;

content.get("/changes", async (c) => {
  const base = c.req.query("base") ?? "";
  if (!SHA.test(base)) return c.json({ error: "invalid", message: "Invalid commit." }, 400);
  const { github } = c.get("config");
  const res = await fetch(
    `https://api.github.com/repos/${github.owner}/${github.repo}/compare/${base}...${encodeURIComponent(github.branch)}?per_page=1`,
    {
      headers: {
        Authorization: `Bearer ${await getUserToken(c)}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Alasin",
      },
    },
  );
  // 404: the commit is gone (e.g. history rewritten); the browser reads everything again.
  if (res.status === 404) return c.json({ error: "not_found", message: "Unknown commit." }, 404);
  if (!res.ok) throw new GitHubError(`compare returned ${res.status}`, res.status);
  return forward(res);
});

const pathsBody = (max: number) =>
  z.strictObject({
    paths: z
      .array(z.string().min(1).max(512).refine((p) => !p.startsWith("/") && !p.split("/").includes("..")))
      .min(1)
      .max(max),
  });

/** The paths of the request body, if valid and all inside the folders Alasin reads. */
async function contentPaths(c: Context<AppEnv>, max: number): Promise<string[] | null> {
  const parsed = pathsBody(max).safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) return null;
  const config = c.get("config");
  const dirs = [config.site.posts_dir, config.site.pages_dir, config.drafts.dir, config.archive.dir, config.bin.dir];
  return parsed.data.paths.every((p) => dirs.some((d) => p.startsWith(`${d}/`))) ? parsed.data.paths : null;
}

content.post("/files", async (c) => {
  const paths = await contentPaths(c, 100);
  if (!paths) return c.json({ error: "invalid", message: "Invalid request." }, 400);
  const { github } = c.get("config");
  const variables: Record<string, string> = { owner: github.owner, name: github.repo, ref: `refs/heads/${github.branch}` };
  paths.forEach((p, i) => (variables[`p${i}`] = `${github.branch}:${p}`));
  const query = `query($owner: String!, $name: String!, $ref: String!, ${paths.map((_, i) => `$p${i}: String!`).join(", ")}) {
  repository(owner: $owner, name: $name) {
    ref(qualifiedName: $ref) { target { oid } }
${paths.map((_, i) => `    p${i}: object(expression: $p${i}) { ... on Blob { oid text isBinary isTruncated } }`).join("\n")}
  }
}`;
  return forward(await graphql(await getUserToken(c), { query, variables }));
});

content.post("/history", async (c) => {
  const paths = await contentPaths(c, 50);
  if (!paths) return c.json({ error: "invalid", message: "Invalid request." }, 400);
  const { github } = c.get("config");
  const variables: Record<string, string> = { owner: github.owner, name: github.repo, ref: `refs/heads/${github.branch}` };
  paths.forEach((p, i) => (variables[`h${i}`] = p));
  const fields = "nodes { committedDate author { name user { login databaseId } } }";
  const query = `query($owner: String!, $name: String!, $ref: String!, ${paths.map((_, i) => `$h${i}: String!`).join(", ")}) {
  repository(owner: $owner, name: $name) {
    ref(qualifiedName: $ref) { target { ... on Commit {
${paths.map((_, i) => `      h${i}: history(first: 1, path: $h${i}) { ${fields} }`).join("\n")}
    } } }
  }
}`;
  return forward(await graphql(await getUserToken(c), { query, variables }));
});
