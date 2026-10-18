// SPDX-License-Identifier: MIT
// `npm run deploy --env dev` (without `--`) makes npm keep `--env` for itself:
// the script then only sees the bare value `dev` and would silently use the
// defaults. npm leaves the swallowed options as npm_config_* variables, so
// they can be detected and reported.

const OPTIONS = ["env", "site", "config", "wrangler_config", "rotate_keys"] as const;

/** Options npm swallowed, e.g. ["--env", "--config"]. */
export function swallowedOptions(environment: Record<string, string | undefined>): string[] {
  return OPTIONS.filter((o) => environment[`npm_config_${o}`] !== undefined).map((o) => `--${o.replace(/_/g, "-")}`);
}

export function swallowedOptionsMessage(script: string, options: string[]): string {
  return (
    `npm kept ${options.join(" and ")} for itself, so ${script} would have run with its defaults.\n` +
    `Put -- before the options, e.g.: npm run ${script} -- --env dev --config path/to/alasin.toml`
  );
}
