// SPDX-License-Identifier: MIT
//
// npm run build  [-- --env <name>] [--config <alasin.toml>] [--wrangler-config <wrangler.toml>]
// npm run dev    [-- ...same, --port <n>]
// npm run deploy [-- ...same]
//
// Validates alasin.toml, builds the web app and runs Wrangler with the
// generated configuration (see scripts/lib/wrangler-config.ts).

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { ConfigError } from "../src/shared/config/schema";
import { parseArgs } from "./lib/args";
import { displayPath, loadAlasinConfig } from "./lib/config";
import { capture, run, start } from "./lib/proc";
import { generateWranglerConfig, REQUIRED_SECRETS } from "./lib/wrangler-config";

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  const args = parseArgs(argv);
  const envArgs = args.env ? ["--env", args.env] : [];

  switch (command) {
    case "build": {
      const config = loadAlasinConfig(args.configPath, args.env);
      if ((await run("vite", ["build", "--logLevel", "warn"])) !== 0) return 1;
      const gen = generateWranglerConfig({ wranglerPath: args.wranglerPath, env: args.env, config, outName: args.env ?? "default" });
      // Bundle without uploading, to catch build errors.
      return run("wrangler", ["deploy", "--dry-run", "--outdir", join(dirname(gen.path), "dist"), "--config", gen.path, ...envArgs]);
    }

    case "dev": {
      const portIndex = args.rest.indexOf("--port");
      const port = portIndex >= 0 ? Number(args.rest[portIndex + 1]) : 8787;
      const config = loadAlasinConfig(args.configPath, args.env);
      // Locally the app runs on localhost; the GitHub App needs
      // http://localhost:<port>/auth/callback as an extra callback URL.
      config.app.url = `http://localhost:${port}`;
      const gen = generateWranglerConfig({ wranglerPath: args.wranglerPath, env: args.env, config, outName: `dev-${args.env ?? "default"}` });
      const dir = dirname(args.wranglerPath);
      const devVars = [args.env && join(dir, `.dev.vars.${args.env}`), join(dir, ".dev.vars")].find((p) => p && existsSync(p));
      if (!devVars) {
        console.warn(`No .dev.vars next to ${displayPath(args.wranglerPath)}; login won't work locally. Run \`npm run setup\` or see README.`);
      }
      if ((await run("vite", ["build", "--logLevel", "warn"])) !== 0) return 1;
      const watcher = start("vite", ["build", "--watch", "--logLevel", "warn"]);
      const code = await run("wrangler", [
        "dev",
        "--config",
        gen.path,
        ...envArgs,
        "--port",
        String(port),
        "--ip",
        "localhost",
        ...(devVars ? ["--env-file", devVars] : []),
      ]);
      watcher.kill();
      return code;
    }

    case "deploy": {
      const config = loadAlasinConfig(args.configPath, args.env);
      const gen = generateWranglerConfig({ wranglerPath: args.wranglerPath, env: args.env, config, outName: args.env ?? "default" });
      const list = capture("wrangler", ["secret", "list", "--format", "json", "--config", args.wranglerPath, ...envArgs]);
      if (list.code === 0) {
        const names = new Set((JSON.parse(list.stdout) as { name: string }[]).map((s) => s.name));
        const missing = REQUIRED_SECRETS.filter((s) => !names.has(s));
        if (missing.length) {
          console.error(`Worker ${gen.workerName} is missing secrets: ${missing.join(", ")}. Run \`npm run setup${args.env ? ` -- --env ${args.env}` : ""}\`.`);
          return 1;
        }
      }
      if ((await run("vite", ["build", "--logLevel", "warn"])) !== 0) return 1;
      return run("wrangler", ["deploy", "--config", gen.path, ...envArgs, ...args.rest]);
    }

    default:
      console.error("usage: tsx scripts/alasin.ts build|dev|deploy [--env <name>] [--config <path>] [--wrangler-config <path>]");
      return 2;
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    if (err instanceof ConfigError) console.error(err.message);
    else console.error(err);
    process.exit(1);
  },
);
