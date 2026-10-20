// SPDX-License-Identifier: MIT
//
// Generates the configuration reference (wiki/Configuration.md) from the config schema, so
// documentation and code can't drift apart. Examples come from alasin.example.toml.
//
//   tsx scripts/config-docs.ts           update wiki/Configuration.md
//   tsx scripts/config-docs.ts --check   fail if it's out of date (npm run lint)

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "smol-toml";
import { z } from "zod";
import { configSchema } from "../src/shared/config/schema";
import { repoRoot } from "./lib/args";

interface JsonSchema {
  type?: string;
  enum?: unknown[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  default?: unknown;
  description?: string;
  format?: string;
}

const START = "<!-- config-reference:start -->";
const END = "<!-- config-reference:end -->";

function typeOf(s: JsonSchema): string {
  if (s.enum) return `one of ${s.enum.map((v) => JSON.stringify(v)).join(", ")}`;
  if (s.type === "array") return `array of ${s.items ? typeOf(s.items) : "values"}`;
  if (s.type === "object" && s.properties) return `{ ${Object.keys(s.properties).join(", ")} }`;
  if (s.format === "uri") return "string (URL)";
  return s.type ?? "value";
}

function inline(v: unknown): string {
  if (v === undefined) return "—";
  const text = typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v).replace(/,/g, ", ").replace(/:/g, " = ");
  return `\`${text.replace(/\|/g, "\\|")}\``;
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function renderReference(): string {
  const schema = z.toJSONSchema(configSchema, { io: "input", unrepresentable: "any" }) as JsonSchema;
  const example = parse(readFileSync(join(repoRoot, "alasin.example.toml"), "utf8")) as Record<string, Record<string, unknown>>;
  const out: string[] = [];
  for (const [table, ts] of Object.entries(schema.properties ?? {})) {
    out.push(`### \`[${table}]\``, "", ts.description ?? "", "");
    out.push("| Option | Type | Default | Example | Description |", "| --- | --- | --- | --- | --- |");
    for (const [key, s] of Object.entries(ts.properties ?? {})) {
      const required = (ts.required ?? []).includes(key) && s.default === undefined;
      const def = required ? "**required**" : s.default !== undefined ? inline(s.default) : "—";
      out.push(`| \`${key}\` | ${cell(typeOf(s))} | ${def} | ${inline(example[table]?.[key])} | ${cell(s.description ?? "")} |`);
    }
    out.push("");
  }
  return out.join("\n").trim();
}

const PAGE = "wiki/Configuration.md";
const pagePath = join(repoRoot, PAGE);
const page = readFileSync(pagePath, "utf8");
const a = page.indexOf(START);
const b = page.indexOf(END);
if (a === -1 || b === -1) throw new Error(`${PAGE} needs the markers ${START} and ${END}`);
const updated = `${page.slice(0, a + START.length)}\n\n${renderReference()}\n\n${page.slice(b)}`;

if (process.argv.includes("--check")) {
  if (updated !== page) {
    console.error(`${PAGE} is out of date. Run \`npm run docs:config\`.`);
    process.exit(1);
  }
} else if (updated !== page) {
  writeFileSync(pagePath, updated);
  console.log(`${PAGE} updated.`);
}
