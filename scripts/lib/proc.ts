// SPDX-License-Identifier: MIT
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { repoRoot } from "./args";

const bin = (name: string) => join(repoRoot, "node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);

/** Runs a project binary (wrangler, vite) with inherited stdio; resolves with its exit code. */
export function run(name: string, args: string[], opts: { input?: string; env?: NodeJS.ProcessEnv } = {}): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(bin(name), args, {
      cwd: repoRoot,
      stdio: [opts.input !== undefined ? "pipe" : "inherit", "inherit", "inherit"],
      env: { ...process.env, ...opts.env },
      shell: process.platform === "win32",
    });
    if (opts.input !== undefined) child.stdin!.end(opts.input);
    child.on("error", reject);
    child.on("exit", (code) => resolvePromise(code ?? 1));
  });
}

/** Runs a project binary and captures its output. */
export function capture(name: string, args: string[], input?: string): { code: number; stdout: string; stderr: string } {
  const r = spawnSync(bin(name), args, {
    cwd: repoRoot,
    encoding: "utf8",
    input,
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", FORCE_COLOR: "0" },
    shell: process.platform === "win32",
    maxBuffer: 64 * 1024 * 1024,
  });
  return { code: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** Starts a long-running project binary; returns the child so it can be stopped. */
export function start(name: string, args: string[]) {
  return spawn(bin(name), args, { cwd: repoRoot, stdio: "inherit", shell: process.platform === "win32" });
}
