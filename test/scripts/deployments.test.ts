// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { chooseConfig, deploymentLine } from "../../scripts/lib/deployments";
import { describeDeployment } from "../../scripts/lib/sites";

const root = "/clone";

/** POSIX join and resolve, enough for these absolute paths. */
const normalize = (p: string) => {
  const out: string[] = [];
  for (const s of p.split("/")) {
    if (s === "..") out.pop();
    else if (s && s !== ".") out.push(s);
  }
  return `/${out.join("/")}`;
};
const path = {
  join: (...parts: string[]) => normalize(parts.join("/")),
  resolve: (...parts: string[]) => normalize(parts.reduce((acc, p) => (p.startsWith("/") ? p : `${acc}/${p}`), "")),
};

function choose(opts: { site?: string; config?: string; wrangler?: string; vars?: { site?: string; config?: string }; files?: string[]; sites?: string[] }) {
  const files = new Set(opts.files ?? []);
  return chooseConfig({ root, cwd: "/work", site: opts.site, config: opts.config, wrangler: opts.wrangler, vars: opts.vars, exists: (p) => files.has(p), deployments: () => opts.sites ?? [], path });
}

describe("which configuration a script uses", () => {
  it("uses deployments/<site>/ for --site", () => {
    expect(choose({ site: "my-site", sites: ["my-site", "other"] })).toEqual({
      site: "my-site",
      siteImplicit: false,
      configPath: "/clone/deployments/my-site/alasin.toml",
      wranglerPath: "/clone/deployments/my-site/wrangler.toml",
    });
  });

  it("keeps ./alasin.toml and --config as before", () => {
    expect(choose({ files: ["/clone/alasin.toml"], sites: ["a", "b"] })).toEqual({ configPath: "/clone/alasin.toml", wranglerPath: "/clone/wrangler.toml" });
    expect(choose({ config: "../elsewhere/alasin.toml", sites: ["a", "b"] })).toEqual({ configPath: "/elsewhere/alasin.toml", wranglerPath: "/elsewhere/wrangler.toml" });
    expect(choose({ config: "/x/alasin.toml", wrangler: "w.toml" }).wranglerPath).toBe("/work/w.toml");
  });

  it("picks the only deployment when there's no ./alasin.toml, and names it", () => {
    const one = choose({ sites: ["my-site"] });
    expect(one).toMatchObject({ site: "my-site", siteImplicit: true, configPath: "/clone/deployments/my-site/alasin.toml" });
    expect(deploymentLine(one)).toBe("Deployment: my-site (deployments/my-site/), the only one");
    expect(choose({}).configPath).toBe("/clone/alasin.toml");
    expect(deploymentLine(choose({}))).toBeNull();
  });

  it("takes ALASIN_SITE / ALASIN_CONFIG, with either flag winning over both", () => {
    expect(choose({ vars: { site: "b" } }).configPath).toBe("/clone/deployments/b/alasin.toml");
    expect(choose({ vars: { config: "/x/alasin.toml" } }).configPath).toBe("/x/alasin.toml");
    expect(choose({ config: "/x/alasin.toml", vars: { site: "b" } })).toEqual({ configPath: "/x/alasin.toml", wranglerPath: "/x/wrangler.toml" });
    expect(choose({ site: "a", vars: { config: "/x/alasin.toml" } }).configPath).toBe("/clone/deployments/a/alasin.toml");
    expect(() => choose({ vars: { site: "b", config: "/x/alasin.toml" } })).toThrow("unset one");
  });

  it("asks for --site when there are several, and refuses odd names or both options", () => {
    expect(() => choose({ sites: ["a", "b"] })).toThrow("Several deployments in deployments/: a, b. Choose one with --site <name>.");
    for (const site of ["..", "a/b", "../x", ""]) expect(() => choose({ site })).toThrow("--site must be");
    expect(() => choose({ site: "a", config: "x.toml" })).toThrow("either --site or --config");
  });
});

describe("npm run sites", () => {
  it("shows the site repository and each environment's Worker and app", () => {
    const alasin = {
      app: { url: "https://app.example.com" },
      github: { owner: "octocat", repo: "my-site", branch: "main" },
      env: { dev: { app: { url: "https://alasin-dev.example.workers.dev" }, github: { branch: "dev" } } },
    };
    const wrangler = { name: "alasin", env: { dev: { name: "alasin-dev" } } };
    expect(describeDeployment(alasin, wrangler)).toEqual([
      "  site repository: octocat/my-site (main)",
      "  production: Worker alasin, https://app.example.com",
      "  dev: Worker alasin-dev, https://alasin-dev.example.workers.dev, branch dev",
    ]);
    expect(describeDeployment(null, null)).toEqual(["  alasin.toml can't be read"]);
  });
});
