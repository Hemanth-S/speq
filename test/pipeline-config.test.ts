import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, DEFAULT_PIPELINE_CONFIG } from "../src/pipeline-config.js";

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "speq-test-"));
}

describe("config-loading", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    // Clean up env vars
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("SPEQ_")) delete process.env[key];
    }
  });

  describe("YAML Config Parsing", () => {
    it("P1: Valid YAML loads correctly", () => {
      writeFileSync(
        join(tmpDir, "speq.config.yaml"),
        "steps:\n  implement:\n    model: sonnet\n  spec:\n    prompt_version: v2\n",
      );
      const config = loadConfig(tmpDir);
      expect(config.steps.implement.model).toBe("sonnet");
      expect(config.steps.spec.prompt_version).toBe("v2");
      // Other fields populated from defaults
      expect(config.steps.plan.model).toBe("sonnet");
      expect(config.steps.requirements.model).toBe("haiku");
    });

    it("P1: Missing config file uses defaults", () => {
      const config = loadConfig(tmpDir);
      expect(config).toEqual(DEFAULT_PIPELINE_CONFIG);
    });

    it("P1: Idempotent config load", () => {
      writeFileSync(
        join(tmpDir, "speq.config.yaml"),
        "steps:\n  implement:\n    model: opus\n",
      );
      const config1 = loadConfig(tmpDir);
      const config2 = loadConfig(tmpDir);
      expect(config1).toEqual(config2);
    });
  });

  describe("Schema Validation", () => {
    it("P0: Secret field names rejected", () => {
      writeFileSync(
        join(tmpDir, "speq.config.yaml"),
        "steps:\n  implement:\n    api_secret: sk-abc123\n",
      );
      expect(() => loadConfig(tmpDir)).toThrow(/secret|token/i);
    });

    it("P0: Token field names rejected", () => {
      writeFileSync(
        join(tmpDir, "speq.config.yaml"),
        "steps:\n  implement:\n    auth_token: tok-abc\n",
      );
      expect(() => loadConfig(tmpDir)).toThrow(/secret|token/i);
    });

    it("P1: Malformed YAML produces friendly error", () => {
      writeFileSync(join(tmpDir, "speq.config.yaml"), "steps:\n  implement: [\n");
      expect(() => loadConfig(tmpDir)).toThrow(/yaml|parse|syntax/i);
    });

    it("P2: Unknown top-level fields rejected with suggestion", () => {
      writeFileSync(
        join(tmpDir, "speq.config.yaml"),
        "stepz:\n  implement:\n    model: sonnet\n",
      );
      expect(() => loadConfig(tmpDir)).toThrow(/stepz.*steps|unknown.*stepz/i);
    });
  });

  describe("Four-Level Precedence", () => {
    it("P1: CLI flag overrides YAML", () => {
      writeFileSync(
        join(tmpDir, "speq.config.yaml"),
        "steps:\n  implement:\n    model: sonnet\n",
      );
      const config = loadConfig(tmpDir, {
        overrides: { "steps.implement.model": "opus" },
      });
      expect(config.steps.implement.model).toBe("opus");
    });

    it("P1: Env var overrides YAML but not CLI", () => {
      writeFileSync(
        join(tmpDir, "speq.config.yaml"),
        "steps:\n  implement:\n    model: sonnet\n",
      );
      process.env.SPEQ_STEPS_IMPLEMENT_MODEL = "haiku";
      const config = loadConfig(tmpDir, {
        overrides: { "steps.implement.model": "opus" },
      });
      expect(config.steps.implement.model).toBe("opus"); // CLI wins
    });

    it("P1: Env var overrides YAML without CLI", () => {
      writeFileSync(
        join(tmpDir, "speq.config.yaml"),
        "steps:\n  implement:\n    model: sonnet\n",
      );
      process.env.SPEQ_STEPS_IMPLEMENT_MODEL = "haiku";
      const config = loadConfig(tmpDir);
      expect(config.steps.implement.model).toBe("haiku"); // env wins over file
    });
  });

  describe("Performance", () => {
    it("P1: Config load under 100ms", () => {
      // Write a config with 20+ fields
      const yaml = [
        "pipeline:",
        "  caveman: true",
        "steps:",
        "  requirements: { model: haiku, prompt_version: v1 }",
        "  enrich: { model: haiku, prompt_version: v1 }",
        "  spec: { model: haiku, prompt_version: v2 }",
        "  plan: { model: sonnet, prompt_version: v1 }",
        "  implement: { model: sonnet, prompt_version: v1, impl: sequential }",
        "  verify: { model: sonnet, prompt_version: v1 }",
        "  done: { model: haiku, prompt_version: v1 }",
        "adr:",
        "  path: docs/adr",
        "evals:",
        "  fixtures_path: .speq/evals/fixtures",
      ].join("\n");
      writeFileSync(join(tmpDir, "speq.config.yaml"), yaml);

      const start = performance.now();
      loadConfig(tmpDir);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(100);
    });
  });
});
