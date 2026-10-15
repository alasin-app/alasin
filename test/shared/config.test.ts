// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { ConfigError, parseConfig, selectEnvironment } from "../../src/shared/config/schema";
import { testConfig } from "../fixtures";

describe("config schema", () => {
  it("accepts the test config and fills in defaults", () => {
    const c = parseConfig(testConfig);
    expect(c.github.branch).toBe("main");
    expect(c.drafts.storage).toBe("private");
    expect(c.editor.lock_expiry_seconds).toBe(180);
    expect(c.security.session_idle_days).toBe(7);
    expect(c.ui.name).toBe("Alasin");
  });

  it("names the option and the file in errors", () => {
    try {
      parseConfig({ ...testConfig, github: { ...testConfig.github, app_id: "x" } }, "deploy/alasin.toml");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      expect((e as Error).message).toContain("deploy/alasin.toml");
      expect((e as ConfigError).issues.some((i) => i.startsWith("github.app_id:"))).toBe(true);
    }
  });

  it("rejects unknown top-level tables", () => {
    expect(() => parseConfig({ ...testConfig, sitee: {} })).toThrow(ConfigError);
  });

  it("rejects insecure and malformed URLs", () => {
    expect(() => parseConfig({ ...testConfig, app: { url: "http://alasin.example.com" } })).toThrow(/https/);
    expect(() => parseConfig({ ...testConfig, app: { url: "https://alasin.example.com/sub" } })).toThrow(/origin/);
    expect(parseConfig({ ...testConfig, app: { url: "http://localhost:8787" } }).app.url).toBe("http://localhost:8787");
  });

  it("rejects path traversal in content directories and patterns", () => {
    expect(() => parseConfig({ ...testConfig, site: { ...testConfig.site, posts_dir: "../secrets" } })).toThrow(ConfigError);
    expect(() => parseConfig({ ...testConfig, site: { ...testConfig.site, posts_dir: "/etc" } })).toThrow(ConfigError);
    expect(() => parseConfig({ ...testConfig, media: { ...testConfig.media, path_pattern: "../{name}" } })).toThrow(ConfigError);
  });

  it("requires at least one allowed user and no duplicate IDs", () => {
    expect(() => parseConfig({ ...testConfig, users: { allow: [] } })).toThrow(/at least one/);
    expect(() =>
      parseConfig({ ...testConfig, users: { allow: [{ login: "a", id: 1 }, { login: "b", id: 1 }] } }),
    ).toThrow(/twice/);
  });

  it("requires the lock expiry to be longer than the heartbeat", () => {
    expect(() => parseConfig({ ...testConfig, editor: { lock_heartbeat_seconds: 120, lock_expiry_seconds: 60 } })).toThrow(
      /lock_heartbeat_seconds/,
    );
  });

  it("applies [env.<name>] overrides by deep merge", () => {
    const raw = {
      ...testConfig,
      env: { dev: { app: { url: "https://alasin-dev.example.com" }, github: { branch: "dev" }, ui: { environment_label: "DEV" } } },
    };
    const dev = parseConfig(selectEnvironment(raw, "dev"));
    expect(dev.app.url).toBe("https://alasin-dev.example.com");
    expect(dev.github.branch).toBe("dev");
    expect(dev.github.owner).toBe("example-owner");
    const prod = parseConfig(selectEnvironment(raw, undefined));
    expect(prod.github.branch).toBe("main");
  });
});

describe("alasin.example.toml", () => {
  it("is valid against the schema, including the commented [env.dev] example", async () => {
    const { parse } = await import("smol-toml");
    const { default: text } = await import("../../alasin.example.toml?raw");
    const raw = parse(text) as Record<string, unknown>;
    expect(() => parseConfig(selectEnvironment(raw, undefined), "alasin.example.toml")).not.toThrow();
    // Uncomment the [env.dev] example and check it too.
    const uncommented = text.replace(/^# (\[env\.dev[^\]]*\]|[a-z_]+ = .*)$/gm, "$1");
    const withDev = parse(uncommented) as Record<string, unknown>;
    const dev = parseConfig(selectEnvironment(withDev, "dev"), "alasin.example.toml [env.dev]");
    expect(dev.github.branch).toBe("dev");
    expect(dev.ui.environment_label).toBe("DEV");
  });

  it("rejects unknown options inside tables", () => {
    expect(() => parseConfig({ ...testConfig, site: { ...testConfig.site, post_dir: "x" } })).toThrow(/post_dir/);
  });
});
