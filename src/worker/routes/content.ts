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
//   GET /api/content        the folders (see contentQuery for the shape)
//   GET /api/content/head   {commit}: the branch's head, to check a cached index

import { Hono } from "hono";
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

export const content = new Hono<AppEnv>();

content.get("/", async (c) => {
  const res = await graphql(await getUserToken(c), contentQuery(c.get("config")));
  return new Response(res.body, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" } });
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
