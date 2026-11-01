// SPDX-License-Identifier: MIT
// In-memory stand-in for the GitHub Contents and Git Data APIs of one
// repository, with real Git blob SHAs, enough for Alasin's commit flow.

const textEncoder = new TextEncoder();

async function gitBlobSha(content: string): Promise<string> {
  const body = textEncoder.encode(content);
  const header = textEncoder.encode(`blob ${body.length}\0`);
  const all = new Uint8Array(header.length + body.length);
  all.set(header);
  all.set(body, header.length);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", all));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomSha(): string {
  return [...crypto.getRandomValues(new Uint8Array(20))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64(s: string): string {
  let bin = "";
  for (const b of textEncoder.encode(s)) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromB64(s: string): string {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

type Tree = Map<string, string>; // path -> blob sha

export class FakeRepo {
  readonly blobs = new Map<string, string>();
  readonly trees = new Map<string, Tree>();
  readonly commits = new Map<string, { tree: string; parents: string[]; message: string }>();
  head = "";
  /** Tokens seen in Authorization headers. */
  readonly tokens: string[] = [];
  /** Collaborators by login, with their permission and user ID; everyone else has "none". */
  readonly collaborators = new Map<string, { permission: string; id: number }>();
  /** Runs once before the next ref update, e.g. to simulate a concurrent commit. */
  beforeRefUpdate?: () => Promise<void>;

  constructor(
    readonly owner: string,
    readonly name: string,
    readonly branch: string,
  ) {
    const tree = randomSha();
    this.trees.set(tree, new Map());
    this.head = randomSha();
    this.commits.set(this.head, { tree, parents: [], message: "initial" });
  }

  files(): Map<string, string> {
    const tree = this.trees.get(this.commits.get(this.head)!.tree)!;
    return new Map([...tree].map(([p, sha]) => [p, this.blobs.get(sha)!]));
  }

  lastCommit() {
    return this.commits.get(this.head)!;
  }

  /** Commits directly, like an edit made on GitHub. */
  async write(path: string, content: string | null, message = "edit on GitHub"): Promise<void> {
    const tree = new Map(this.trees.get(this.commits.get(this.head)!.tree)!);
    if (content === null) tree.delete(path);
    else {
      const sha = await gitBlobSha(content);
      this.blobs.set(sha, content);
      tree.set(path, sha);
    }
    const treeSha = randomSha();
    this.trees.set(treeSha, tree);
    const commit = randomSha();
    this.commits.set(commit, { tree: treeSha, parents: [this.head], message });
    this.head = commit;
  }

  private treeAt(ref: string): Tree | undefined {
    const commit = ref === this.branch ? this.head : ref;
    const c = this.commits.get(commit);
    return c ? this.trees.get(c.tree) : undefined;
  }

  /** A folder as nested GraphQL tree entries (the shape of Alasin's content query). */
  private async contentTree(folder: string): Promise<unknown> {
    type Node = { name: string; type: "blob" | "tree"; object: Record<string, unknown> };
    const tree = this.treeAt(this.branch)!;
    const root: Node[] = [];
    let found = false;
    for (const [p, sha] of tree) {
      if (!p.startsWith(`${folder}/`)) continue;
      found = true;
      const parts = p.slice(folder.length + 1).split("/");
      let level = root;
      parts.forEach((part, i) => {
        const last = i === parts.length - 1;
        let node = level.find((n) => n.name === part);
        if (!node) {
          node = last
            ? { name: part, type: "blob", object: { oid: sha, text: this.blobs.get(sha)!, isBinary: false, isTruncated: false } }
            : { name: part, type: "tree", object: { entries: [] } };
          level.push(node);
        }
        if (!last) level = node.object.entries as Node[];
      });
    }
    return found ? { entries: root } : null;
  }

  /** Answers Alasin's GraphQL queries from the branch head. */
  private async graphql(req: Request): Promise<Response> {
    const body = (await req.json()) as { variables: Record<string, string> & { expr: string } };
    if (body.variables.ref) {
      const repository: Record<string, unknown> = { ref: { target: { oid: this.head } } };
      const tree = this.treeAt(this.branch)!;
      // Last commit that changed each path (history queries).
      const target = repository.ref as { target: Record<string, unknown> };
      for (const [k, path] of Object.entries(body.variables)) {
        if (!/^h\d+$/.test(k)) continue;
        let found: string | null = null;
        for (let c = this.head; c; ) {
          const commit = this.commits.get(c)!;
          const parent = commit.parents[0];
          const before = parent ? this.trees.get(this.commits.get(parent)!.tree)!.get(path) : undefined;
          if (this.trees.get(commit.tree)!.get(path) !== before) {
            found = c;
            break;
          }
          c = parent ?? "";
        }
        target.target[k] = {
          nodes: found ? [{ committedDate: "2026-10-15T12:00:00Z", author: { name: "The Octocat", user: { login: "octocat", databaseId: 583231 } } }] : [],
        };
      }
      for (const [k, v] of Object.entries(body.variables)) {
        if (!/^p\d+$/.test(k)) continue;
        const sha = tree.get(v.split(":").slice(1).join(":"));
        repository[k] = sha ? { oid: sha, text: this.blobs.get(sha)!, isBinary: false, isTruncated: false } : null;
      }
      for (const f of ["content", "posts", "pages", "drafts", "archive", "bin"]) {
        if (body.variables[f]) repository[f] = await this.contentTree(body.variables[f]!.split(":").slice(1).join(":"));
      }
      return Response.json({ data: { repository } });
    }
    const folder = body.variables.expr.split(":").slice(1).join(":");
    const tree = this.treeAt(this.branch)!;
    type Entry = { name: string; object: { text?: string; entries?: Entry[] } };
    const top = new Map<string, Entry>();
    for (const [p, sha] of tree) {
      if (!p.startsWith(`${folder}/`)) continue;
      const parts = p.slice(folder.length + 1).split("/");
      if (parts.length === 1) top.set(parts[0]!, { name: parts[0]!, object: { text: this.blobs.get(sha)! } });
      else if (parts.length === 2) {
        const dir = top.get(parts[0]!) ?? { name: parts[0]!, object: { entries: [] } };
        dir.object.entries!.push({ name: parts[1]!, object: { text: this.blobs.get(sha)! } });
        top.set(parts[0]!, dir);
      }
    }
    return Response.json({ data: { repository: { object: top.size ? { entries: [...top.values()] } : null } } });
  }

  /** Handles a request for this repository, or returns undefined. */
  async handle(req: Request): Promise<Response | undefined> {
    const url = new URL(req.url);
    if (url.href === "https://api.github.com/graphql" && req.method === "POST") {
      this.tokens.push(req.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "");
      return this.graphql(req);
    }
    const prefix = `/repos/${this.owner}/${this.name}`;
    if (url.hostname !== "api.github.com" || !url.pathname.startsWith(`${prefix}/`)) return undefined;
    this.tokens.push(req.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "");
    const path = decodeURIComponent(url.pathname.slice(prefix.length));
    const json = (data: unknown, status = 200) => Response.json(data, { status });

    if (req.method === "GET" && path.startsWith("/contents/")) {
      const filePath = path.slice("/contents/".length);
      const tree = this.treeAt(url.searchParams.get("ref") ?? this.branch);
      if (!tree) return json({ message: "No commit found" }, 404);
      const sha = tree.get(filePath);
      if (sha && req.headers.get("Accept") === "application/vnd.github.raw") return new Response(this.blobs.get(sha)!);
      if (sha) return json({ type: "file", path: filePath, name: filePath.split("/").pop(), sha, encoding: "base64", content: b64(this.blobs.get(sha)!) });
      const children = new Map<string, { name: string; path: string; sha: string; type: string }>();
      for (const [p, s] of tree) {
        if (!p.startsWith(`${filePath}/`)) continue;
        const rest = p.slice(filePath.length + 1);
        const [first, ...more] = rest.split("/");
        children.set(first!, { name: first!, path: `${filePath}/${first}`, sha: more.length ? randomSha() : s, type: more.length ? "dir" : "file" });
      }
      return children.size ? json([...children.values()]) : json({ message: "Not Found" }, 404);
    }
    if (req.method === "GET" && path === `/git/ref/heads/${this.branch}`) return json({ object: { sha: this.head } });
    const collaborator = /^\/collaborators\/([^/]+)\/permission$/.exec(path);
    if (req.method === "GET" && collaborator) {
      const role = this.collaborators.get(collaborator[1]!)?.permission ?? "none";
      // Like GitHub: "permission" has only admin/write/read/none; role_name tells maintain and triage apart.
      const permission = role === "maintain" ? "write" : role === "triage" ? "read" : role;
      return json({ permission, role_name: role === "none" ? "" : role });
    }
    if (req.method === "GET" && path === "/collaborators") {
      const page = Number(url.searchParams.get("page") ?? "1");
      const writers = [...this.collaborators].filter(([, c]) => ["admin", "maintain", "write"].includes(c.permission));
      return json(page === 1 ? writers.map(([login, c]) => ({ login, id: c.id, type: "User" })) : []);
    }
    if (req.method === "GET" && path === "/commits") {
      // The last commit on the branch that changed `path`.
      const file = url.searchParams.get("path") ?? "";
      for (let c = this.head; c; ) {
        const commit = this.commits.get(c)!;
        const parent = commit.parents[0];
        const before = parent ? this.trees.get(this.commits.get(parent)!.tree)!.get(file) : undefined;
        if (this.trees.get(commit.tree)!.get(file) !== before) return json([{ sha: c }]);
        c = parent ?? "";
      }
      return json([]);
    }
    if (req.method === "GET" && path.startsWith("/commits/")) {
      const commit = this.commits.get(path.slice("/commits/".length));
      if (!commit) return json({ message: "Not Found" }, 404);
      const to = this.trees.get(commit.tree)!;
      const from = commit.parents[0] ? this.trees.get(this.commits.get(commit.parents[0])!.tree)! : new Map<string, string>();
      const files: { filename: string; status: string }[] = [];
      for (const [p, sha] of to) if (from.get(p) !== sha) files.push({ filename: p, status: from.has(p) ? "modified" : "added" });
      for (const [p] of from) if (!to.has(p)) files.push({ filename: p, status: "removed" });
      return json({ sha: path.slice("/commits/".length), files });
    }
    if (req.method === "GET" && path.startsWith("/compare/")) {
      const [base, head] = path.slice("/compare/".length).split("...") as [string, string];
      const from = this.treeAt(base);
      const to = this.treeAt(head);
      if (!from || !to) return json({ message: "Not Found" }, 404);
      const files: { filename: string; status: string; sha: string | null }[] = [];
      for (const [p, sha] of to) if (from.get(p) !== sha) files.push({ filename: p, status: from.has(p) ? "modified" : "added", sha });
      for (const [p] of from) if (!to.has(p)) files.push({ filename: p, status: "removed", sha: null });
      return json({ status: "ahead", files });
    }
    if (req.method === "GET" && path.startsWith("/git/commits/")) {
      const c = this.commits.get(path.slice("/git/commits/".length));
      return c ? json({ tree: { sha: c.tree } }) : json({ message: "Not Found" }, 404);
    }
    if (req.method === "POST" && path === "/git/blobs") {
      const body = (await req.json()) as { content: string; encoding: string };
      const content = fromB64(body.content);
      const sha = await gitBlobSha(content);
      this.blobs.set(sha, content);
      return json({ sha }, 201);
    }
    if (req.method === "POST" && path === "/git/trees") {
      const body = (await req.json()) as { base_tree: string; tree: { path: string; sha: string | null }[] };
      const tree = new Map(this.trees.get(body.base_tree));
      for (const e of body.tree) {
        if (e.sha === null) tree.delete(e.path);
        else tree.set(e.path, e.sha);
      }
      const sha = randomSha();
      this.trees.set(sha, tree);
      return json({ sha }, 201);
    }
    if (req.method === "POST" && path === "/git/commits") {
      const body = (await req.json()) as { message: string; tree: string; parents: string[] };
      const sha = randomSha();
      this.commits.set(sha, { tree: body.tree, parents: body.parents, message: body.message });
      return json({ sha }, 201);
    }
    if (req.method === "PATCH" && path === `/git/refs/heads/${this.branch}`) {
      if (this.beforeRefUpdate) {
        const hook = this.beforeRefUpdate;
        this.beforeRefUpdate = undefined;
        await hook();
      }
      const body = (await req.json()) as { sha: string; force: boolean };
      const commit = this.commits.get(body.sha);
      if (!commit || commit.parents[0] !== this.head) return json({ message: "Update is not a fast forward" }, 422);
      this.head = body.sha;
      return json({ object: { sha: body.sha } });
    }
    return json({ message: `fake repo: unhandled ${req.method} ${path}` }, 501);
  }
}
