// SPDX-License-Identifier: MIT
//
// The site repository, accessed with the signed-in user's GitHub token, so
// commits are attributed to that user. Repository and branch come only from
// server-side configuration.
//
// Commits go through the Git Trees API (one commit for any number of files)
// and are optimistic: every change states the blob SHA it expects to replace
// (null for a new file). If a file changed meanwhile — another user, or an edit
// made directly on GitHub — the commit is refused with ConflictError instead
// of overwriting it.

import { GitHubError } from "./github";
import { toBase64, utf8 } from "./encoding";

const API = "https://api.github.com";
const MAX_ATTEMPTS = 3;

export class ConflictError extends Error {
  constructor(readonly path: string) {
    super(`${path} was changed by someone else`);
    this.name = "ConflictError";
  }
}

export interface RepoFile {
  path: string;
  content: string;
  /** Blob SHA, used as the expected version when saving. */
  sha: string;
}

export interface RepoEntry {
  name: string;
  path: string;
  sha: string;
  type: "file" | "dir";
}

export interface FileChange {
  path: string;
  /** New content, or null to delete the file. */
  content: string | null;
  /** Blob SHA the caller last saw, or null if the file must not exist yet. */
  expectedSha: string | null;
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export class Repo {
  constructor(
    private readonly token: string,
    private readonly owner: string,
    private readonly name: string,
    readonly branch: string,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T | null }> {
    const res = await fetch(`${API}/repos/${this.owner}/${this.name}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Alasin",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 404) return { status: 404, data: null };
    if (!res.ok && res.status !== 422) throw new GitHubError(`${method} ${path.split("?")[0]} returned ${res.status}`, res.status);
    return { status: res.status, data: (await res.json()) as T };
  }

  private async contents<T>(path: string, ref: string) {
    return this.request<T>("GET", `/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`);
  }

  /** A file on the branch, or null if it doesn't exist. */
  async getFile(path: string, ref = this.branch): Promise<RepoFile | null> {
    const { data } = await this.contents<{ type: string; content?: string; encoding?: string; sha: string }>(path, ref);
    if (!data) return null;
    if (data.type !== "file" || data.encoding !== "base64" || data.content === undefined) {
      throw new GitHubError(`${path} is not a regular file`, 422);
    }
    const bin = atob(data.content.replace(/\s/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { path, content: utf8.decode(bytes), sha: data.sha };
  }

  /** Entries of a directory on the branch; empty if it doesn't exist. */
  async listDir(path: string): Promise<RepoEntry[]> {
    const { data } = await this.contents<{ name: string; path: string; sha: string; type: string }[]>(path, this.branch);
    if (!data || !Array.isArray(data)) return [];
    return data
      .filter((e) => e.type === "file" || e.type === "dir")
      .map((e) => ({ name: e.name, path: e.path, sha: e.sha, type: e.type as "file" | "dir" }));
  }

  /** Commits all changes in one commit. Returns the commit SHA and each file's new blob SHA. */
  async commit(changes: FileChange[], message: string): Promise<{ commit: string; shas: Record<string, string | null> }> {
    for (let attempt = 1; ; attempt++) {
      const { data: ref } = await this.request<{ object: { sha: string } }>("GET", `/git/ref/heads/${encodePath(this.branch)}`);
      if (!ref) throw new GitHubError(`branch ${this.branch} not found`, 404);
      const head = ref.object.sha;
      const { data: headCommit } = await this.request<{ tree: { sha: string } }>("GET", `/git/commits/${head}`);
      if (!headCommit) throw new GitHubError("head commit not found", 404);

      // Optimistic concurrency: each file must still be what the caller last saw.
      for (const change of changes) {
        const current = await this.contents<{ sha: string; type: string }>(change.path, head);
        const currentSha = current.data && !Array.isArray(current.data) ? current.data.sha : null;
        if (currentSha !== change.expectedSha) throw new ConflictError(change.path);
      }

      const shas: Record<string, string | null> = {};
      const tree: { path: string; mode: "100644"; type: "blob"; sha: string | null }[] = [];
      for (const change of changes) {
        if (change.content === null) {
          tree.push({ path: change.path, mode: "100644", type: "blob", sha: null });
          shas[change.path] = null;
          continue;
        }
        const { data: blob } = await this.request<{ sha: string }>("POST", "/git/blobs", {
          content: toBase64(utf8.encode(change.content)),
          encoding: "base64",
        });
        if (!blob) throw new GitHubError("creating a blob failed", 502);
        tree.push({ path: change.path, mode: "100644", type: "blob", sha: blob.sha });
        shas[change.path] = blob.sha;
      }
      const { data: newTree } = await this.request<{ sha: string }>("POST", "/git/trees", { base_tree: headCommit.tree.sha, tree });
      if (!newTree) throw new GitHubError("creating a tree failed", 502);
      const { data: commit } = await this.request<{ sha: string }>("POST", "/git/commits", {
        message,
        tree: newTree.sha,
        parents: [head],
      });
      if (!commit) throw new GitHubError("creating a commit failed", 502);

      // Moves the branch only if it still points at `head` (no force).
      const update = await this.request<{ object?: { sha: string } }>("PATCH", `/git/refs/heads/${encodePath(this.branch)}`, {
        sha: commit.sha,
        force: false,
      });
      if (update.status !== 422) return { commit: commit.sha, shas };
      // The branch moved (an unrelated commit landed meanwhile): start again from the new head.
      if (attempt >= MAX_ATTEMPTS) throw new GitHubError("the branch kept changing; try again", 409);
    }
  }
}

export interface TreeFile {
  /** Path relative to the listed folder, e.g. "news/_index.md". */
  path: string;
  text: string;
}

/**
 * The text of every file in a folder and its direct subfolders, in one
 * GraphQL request (instead of one request per file).
 */
export async function readFolderTexts(token: string, owner: string, name: string, branch: string, folder: string): Promise<TreeFile[]> {
  const query = `query($owner: String!, $name: String!, $expr: String!) {
    repository(owner: $owner, name: $name) {
      object(expression: $expr) {
        ... on Tree { entries { name object {
          ... on Blob { text }
          ... on Tree { entries { name object { ... on Blob { text } } } }
        } } }
      }
    }
  }`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "Alasin" },
    body: JSON.stringify({ query, variables: { owner, name, expr: `${branch}:${folder}` } }),
  });
  if (!res.ok) throw new GitHubError(`GraphQL returned ${res.status}`, res.status);
  type Entry = { name: string; object: { text?: string | null; entries?: Entry[] } | null };
  const data = (await res.json()) as { data?: { repository?: { object?: { entries?: Entry[] } | null } | null } };
  const out: TreeFile[] = [];
  for (const e of data.data?.repository?.object?.entries ?? []) {
    if (typeof e.object?.text === "string") out.push({ path: e.name, text: e.object.text });
    for (const sub of e.object?.entries ?? []) {
      if (typeof sub.object?.text === "string") out.push({ path: `${e.name}/${sub.name}`, text: sub.object.text });
    }
  }
  return out;
}
