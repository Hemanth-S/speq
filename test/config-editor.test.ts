import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  displayConfig,
  setConfigValue,
  migrateConfig,
} from "../src/config-editor.js";

const BEGIN_MARKER = "<!-- BEGIN SPEQ -->";
const END_MARKER = "<!-- END SPEQ -->";

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "speq-config-editor-test-"));
}

function makeSpeqBlock(content: string): string {
  return `${BEGIN_MARKER}\n${content}\n${END_MARKER}`;
}

describe("config-editor", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Display ──────────────────────────────────────────────────────────────

  describe("displayConfig", () => {
    it("P1: shows all settings with values and source=file when speq.config.yaml exists", () => {
      writeFileSync(
        join(tmpDir, "speq.config.yaml"),
        "steps:\n  implement:\n    model: sonnet\n",
      );
      const entries = displayConfig(tmpDir);

      // Must return an array of entries
      expect(Array.isArray(entries)).toBe(true);
      expect(entries.length).toBeGreaterThan(0);

      // Every entry has key, value, source
      for (const entry of entries) {
        expect(typeof entry.key).toBe("string");
        expect(typeof entry.value).toBe("string");
        expect(["file", "default", "env"]).toContain(entry.source);
      }

      // The overridden field should report source=file with the correct value
      const implementModel = entries.find((e) => e.key === "steps.implement.model");
      expect(implementModel).toBeDefined();
      expect(implementModel!.value).toBe("sonnet");
      expect(implementModel!.source).toBe("file");
    });

    it("P1: returns default-sourced entries when no speq.config.yaml exists", () => {
      const entries = displayConfig(tmpDir);
      expect(Array.isArray(entries)).toBe(true);
      expect(entries.length).toBeGreaterThan(0);

      // All entries should be 'default' when no config file
      for (const entry of entries) {
        expect(entry.source).toBe("default");
      }
    });

    it("P1: includes all top-level config keys in output", () => {
      const entries = displayConfig(tmpDir);
      const keys = entries.map((e) => e.key);

      // Should include pipeline, steps.*, adr, evals keys
      expect(keys.some((k) => k.startsWith("pipeline."))).toBe(true);
      expect(keys.some((k) => k.startsWith("steps."))).toBe(true);
      expect(keys.some((k) => k.startsWith("adr."))).toBe(true);
      expect(keys.some((k) => k.startsWith("evals."))).toBe(true);
    });
  });

  // ── setConfigValue ───────────────────────────────────────────────────────

  describe("setConfigValue", () => {
    it("P1: valid edit is accepted and written to speq.config.yaml", () => {
      writeFileSync(
        join(tmpDir, "speq.config.yaml"),
        "steps:\n  implement:\n    model: sonnet\n",
      );
      const result = setConfigValue(tmpDir, "steps.implement.model", "haiku");
      expect(result.ok).toBe(true);
      expect(result.message).toMatch(/haiku/i);

      // Verify file was actually updated
      const content = readFileSync(join(tmpDir, "speq.config.yaml"), "utf-8");
      expect(content).toContain("haiku");
    });

    it("P1: valid edit creates speq.config.yaml when it does not exist", () => {
      const result = setConfigValue(tmpDir, "steps.implement.model", "opus");
      expect(result.ok).toBe(true);
      expect(existsSync(join(tmpDir, "speq.config.yaml"))).toBe(true);

      const content = readFileSync(join(tmpDir, "speq.config.yaml"), "utf-8");
      expect(content).toContain("opus");
    });

    it("P0: secret field name (_token suffix) is rejected", () => {
      writeFileSync(
        join(tmpDir, "speq.config.yaml"),
        "steps:\n  implement:\n    model: sonnet\n",
      );
      const before = readFileSync(join(tmpDir, "speq.config.yaml"), "utf-8");

      const result = setConfigValue(tmpDir, "steps.implement.api_token", "sk-test");
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/secret|env var/i);

      // File must be unchanged
      const after = readFileSync(join(tmpDir, "speq.config.yaml"), "utf-8");
      expect(after).toBe(before);
    });

    it("P0: secret field name (_secret suffix) is rejected", () => {
      writeFileSync(
        join(tmpDir, "speq.config.yaml"),
        "steps:\n  implement:\n    model: sonnet\n",
      );
      const before = readFileSync(join(tmpDir, "speq.config.yaml"), "utf-8");

      const result = setConfigValue(tmpDir, "steps.implement.api_secret", "sk-test");
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/secret|env var/i);

      const after = readFileSync(join(tmpDir, "speq.config.yaml"), "utf-8");
      expect(after).toBe(before);
    });

    it("P1: idempotent write — same value does not change file content", () => {
      writeFileSync(
        join(tmpDir, "speq.config.yaml"),
        "steps:\n  implement:\n    model: sonnet\n",
      );
      const before = readFileSync(join(tmpDir, "speq.config.yaml"), "utf-8");

      const result = setConfigValue(tmpDir, "steps.implement.model", "sonnet");
      expect(result.ok).toBe(true);
      expect(result.message).toMatch(/no change|unchanged|already/i);

      const after = readFileSync(join(tmpDir, "speq.config.yaml"), "utf-8");
      expect(after).toBe(before);
    });
  });

  // ── migrateConfig ────────────────────────────────────────────────────────

  describe("migrateConfig", () => {
    it("P1: migrates pipeline keys from CLAUDE.md speq block to speq.config.yaml", () => {
      const speqBlock = makeSpeqBlock(
        "caveman.prd: on\ncaveman.openspec: off\ncaveman.beads: on\n",
      );
      writeFileSync(join(tmpDir, "CLAUDE.md"), `# Project\n${speqBlock}\n`);

      const result = migrateConfig(tmpDir);
      expect(result.ok).toBe(true);
      expect(result.keysLifted).toBeGreaterThan(0);

      // speq.config.yaml should exist and contain pipeline.caveman
      expect(existsSync(join(tmpDir, "speq.config.yaml"))).toBe(true);
      const yaml = readFileSync(join(tmpDir, "speq.config.yaml"), "utf-8");
      expect(yaml).toMatch(/pipeline/);
      expect(yaml).toMatch(/caveman/);

      // Pipeline keys should be removed from CLAUDE.md
      const claude = readFileSync(join(tmpDir, "CLAUDE.md"), "utf-8");
      expect(claude).not.toMatch(/caveman\.prd/);
      expect(claude).not.toMatch(/caveman\.openspec/);
      expect(claude).not.toMatch(/caveman\.beads/);

      // Non-pipeline content preserved
      expect(claude).toContain("# Project");
    });

    it("P1: non-pipeline content inside speq block is preserved after migration", () => {
      const speqBlock = makeSpeqBlock(
        "caveman.prd: on\ncaveman.openspec: on\ncaveman.beads: on\nsome.other.setting: value\n",
      );
      writeFileSync(join(tmpDir, "CLAUDE.md"), speqBlock);

      migrateConfig(tmpDir);

      const claude = readFileSync(join(tmpDir, "CLAUDE.md"), "utf-8");
      // Non-caveman line should remain
      expect(claude).toContain("some.other.setting: value");
    });

    it("P1: idempotent migration — running twice leaves files unchanged on second run", () => {
      const speqBlock = makeSpeqBlock(
        "caveman.prd: on\ncaveman.openspec: on\ncaveman.beads: on\n",
      );
      writeFileSync(join(tmpDir, "CLAUDE.md"), `# Project\n${speqBlock}\n`);

      // First run
      migrateConfig(tmpDir);
      const claudeAfterFirst = readFileSync(join(tmpDir, "CLAUDE.md"), "utf-8");
      const yamlAfterFirst = readFileSync(join(tmpDir, "speq.config.yaml"), "utf-8");

      // Second run
      const result = migrateConfig(tmpDir);
      expect(result.ok).toBe(true);

      const claudeAfterSecond = readFileSync(join(tmpDir, "CLAUDE.md"), "utf-8");
      const yamlAfterSecond = readFileSync(join(tmpDir, "speq.config.yaml"), "utf-8");

      expect(claudeAfterSecond).toBe(claudeAfterFirst);
      expect(yamlAfterSecond).toBe(yamlAfterFirst);
    });

    it("P2: no CLAUDE.md — returns graceful message, exits ok", () => {
      const result = migrateConfig(tmpDir);
      expect(result.ok).toBe(true);
      expect(result.message).toMatch(/nothing to migrate|no claude\.md/i);
      expect(result.keysLifted).toBe(0);
    });

    it("P2: CLAUDE.md exists but has no speq block — returns graceful message, exits ok", () => {
      writeFileSync(join(tmpDir, "CLAUDE.md"), "# My Project\nSome instructions.\n");

      const result = migrateConfig(tmpDir);
      expect(result.ok).toBe(true);
      expect(result.message).toMatch(/nothing to migrate|no speq block/i);
      expect(result.keysLifted).toBe(0);
    });
  });
});
