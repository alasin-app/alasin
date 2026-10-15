// SPDX-License-Identifier: MIT
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

const rl = createInterface({ input: stdin, output: stdout });

export const bold = (s: string) => (stdout.isTTY ? `\x1b[1m${s}\x1b[0m` : s);
export const dim = (s: string) => (stdout.isTTY ? `\x1b[2m${s}\x1b[0m` : s);
export const green = (s: string) => (stdout.isTTY ? `\x1b[32m${s}\x1b[0m` : s);
export const red = (s: string) => (stdout.isTTY ? `\x1b[31m${s}\x1b[0m` : s);
export const yellow = (s: string) => (stdout.isTTY ? `\x1b[33m${s}\x1b[0m` : s);

export function step(title: string) {
  console.log(`\n${bold(`▸ ${title}`)}`);
}
export const ok = (msg: string) => console.log(`  ${green("✓")} ${msg}`);
export const info = (msg: string) => console.log(`  ${msg}`);
export const warn = (msg: string) => console.log(`  ${yellow("!")} ${msg}`);

/** Asks until `validate` returns null (no error). */
export async function ask(question: string, opts: { default?: string; validate?: (v: string) => string | null } = {}): Promise<string> {
  for (;;) {
    const suffix = opts.default ? dim(` [${opts.default}]`) : "";
    const answer = (await rl.question(`  ${question}${suffix}: `)).trim() || opts.default || "";
    const error = opts.validate ? opts.validate(answer) : answer ? null : "a value is required";
    if (!error) return answer;
    console.log(`    ${red(error)}`);
  }
}

export async function confirm(question: string, defaultYes = true): Promise<boolean> {
  const answer = (await rl.question(`  ${question} ${dim(defaultYes ? "[Y/n]" : "[y/N]")} `)).trim().toLowerCase();
  if (!answer) return defaultYes;
  return answer === "y" || answer === "yes" || answer === "k" || answer === "kyllä";
}

export function closePrompt() {
  rl.close();
}
