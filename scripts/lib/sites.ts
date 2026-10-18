// SPDX-License-Identifier: MIT
// What `npm run sites` shows for one deployment, from its alasin.toml and
// wrangler.toml as written (not validated, so a half-finished setup shows too).

type Table = Record<string, unknown>;

const table = (v: unknown): Table => (v && typeof v === "object" && !Array.isArray(v) ? (v as Table) : {});
const text = (v: unknown) => (typeof v === "string" && v ? v : "?");

/** One line per environment: production first, then [env.*]. */
export function describeDeployment(alasin: Table | null, wrangler: Table | null): string[] {
  if (!alasin) return ["  alasin.toml can't be read"];
  const github = table(alasin.github);
  const lines = [`  site repository: ${text(github.owner)}/${text(github.repo)} (${typeof github.branch === "string" ? github.branch : "main"})`];
  const envs = { "": {}, ...table(alasin.env) } as Record<string, unknown>;
  for (const [name, override] of Object.entries(envs)) {
    const o = table(override);
    const app = { ...table(alasin.app), ...table(o.app) };
    const branch = table(o.github).branch;
    const worker = name ? table(table(wrangler?.env)[name]).name : wrangler?.name;
    lines.push(`  ${name || "production"}: Worker ${text(worker)}, ${text(app.url)}${typeof branch === "string" ? `, branch ${branch}` : ""}`);
  }
  return lines;
}
