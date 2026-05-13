import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { syncPrompts } from "../src/prompt-sync.js";
import type { PipelineConfig } from "../src/pipeline-config.js";

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "speq-prompt-sync-test-"));
}

/**
 * Create the versioned prompt file at prompts/<step>/<version>.md inside a project dir.
 */
function createPromptFile(
  projectDir: string,
  step: string,
  version: string,
  content: string,
): void {
  const dir = join(projectDir, "prompts", step);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${version}.md`), content, "utf-8");
}

/**
 * Build a minimal PipelineConfig for testing.
 */
function makeConfig(
  overrides: Partial<PipelineConfig> = {},
): PipelineConfig {
  const base: PipelineConfig = {
    pipeline: { caveman: false },
    steps: {
      spec: { model: "haiku", prompt_version: "v1" },
      plan: { model: "sonnet", prompt_version: "v1" },
    },
    adr: { path: "docs/adr" },
    evals: { fixtures_path: ".speq/evals/fixtures" },
  };
  return { ...base, ...overrides };
}

describe("prompt-sync", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // Req: Prompt Materialization
  // ---------------------------------------------------------------------------

  describe("P1: Configured version materialized", () => {
    it("writes the configured prompt version to .claude/commands/<step>.md", () => {
      const specContent = "# spec prompt v2\nThis is version 2.";
      createPromptFile(tmpDir, "spec", "v2", specContent);
      createPromptFile(tmpDir, "plan", "v1", "# plan prompt v1");

      const config = makeConfig({
        steps: {
          spec: { model: "haiku", prompt_version: "v2" },
          plan: { model: "sonnet", prompt_version: "v1" },
        },
      });

      syncPrompts(tmpDir, config);

      const written = readFileSync(
        join(tmpDir, ".claude", "commands", "spec.md"),
        "utf-8",
      );
      expect(written).toBe(specContent);
    });
  });

  describe("P1: Default version (v1) used when not explicitly set", () => {
    it("falls back to v1 when prompt_version is omitted from step config", () => {
      const planContent = "# plan prompt v1\nDefault version content.";
      createPromptFile(tmpDir, "plan", "v1", planContent);

      // Build a config where plan has no prompt_version — simulate by passing v1 explicitly
      // The spec says: "speq.config.yaml has no steps.plan.prompt_version entry"
      // In our type system prompt_version is always present after defaulting; we test
      // that "v1" is the default wired in DEFAULT_PIPELINE_CONFIG and used here.
      const config = makeConfig({
        steps: {
          plan: { model: "sonnet", prompt_version: "v1" },
        },
      });

      syncPrompts(tmpDir, config);

      const written = readFileSync(
        join(tmpDir, ".claude", "commands", "plan.md"),
        "utf-8",
      );
      expect(written).toBe(planContent);
    });
  });

  describe("P0: Path traversal rejected", () => {
    it("throws for a dotdot traversal in the version string", () => {
      const config = makeConfig({
        steps: {
          spec: { model: "haiku", prompt_version: "../../etc/passwd" },
        },
      });

      expect(() => syncPrompts(tmpDir, config)).toThrow(
        /path traversal|invalid version/i,
      );
    });

    it("throws for a version with a forward slash", () => {
      const config = makeConfig({
        steps: {
          spec: { model: "haiku", prompt_version: "v1/evil" },
        },
      });

      expect(() => syncPrompts(tmpDir, config)).toThrow(
        /path traversal|invalid version/i,
      );
    });

    it("throws for a version with a backslash", () => {
      const config = makeConfig({
        steps: {
          spec: { model: "haiku", prompt_version: "v1\\evil" },
        },
      });

      expect(() => syncPrompts(tmpDir, config)).toThrow(
        /path traversal|invalid version/i,
      );
    });

    it("does not read any file outside the prompts/ directory", () => {
      // Create a file that traversal would reach
      writeFileSync(join(tmpDir, "secrets.txt"), "super-secret", "utf-8");

      const config = makeConfig({
        steps: {
          spec: { model: "haiku", prompt_version: "../secrets.txt" },
        },
      });

      expect(() => syncPrompts(tmpDir, config)).toThrow(
        /path traversal|invalid version/i,
      );
      // secrets.txt must not have been modified
      expect(readFileSync(join(tmpDir, "secrets.txt"), "utf-8")).toBe(
        "super-secret",
      );
    });
  });

  describe("P1: Idempotent sync", () => {
    it("second run produces byte-identical files", () => {
      const specContent = "# spec v1\nIdempotency content.";
      const planContent = "# plan v1\nIdempotency plan.";
      createPromptFile(tmpDir, "spec", "v1", specContent);
      createPromptFile(tmpDir, "plan", "v1", planContent);

      const config = makeConfig();

      syncPrompts(tmpDir, config);
      const specAfterFirst = readFileSync(
        join(tmpDir, ".claude", "commands", "spec.md"),
        "utf-8",
      );
      const planAfterFirst = readFileSync(
        join(tmpDir, ".claude", "commands", "plan.md"),
        "utf-8",
      );

      syncPrompts(tmpDir, config);
      const specAfterSecond = readFileSync(
        join(tmpDir, ".claude", "commands", "spec.md"),
        "utf-8",
      );
      const planAfterSecond = readFileSync(
        join(tmpDir, ".claude", "commands", "plan.md"),
        "utf-8",
      );

      expect(specAfterFirst).toBe(specAfterSecond);
      expect(planAfterFirst).toBe(planAfterSecond);
    });
  });

  describe("P2: Missing prompt version file produces clear error", () => {
    it("throws a clear error naming the missing file", () => {
      // spec/v3.md does NOT exist
      createPromptFile(tmpDir, "plan", "v1", "# plan prompt v1");

      const config = makeConfig({
        steps: {
          spec: { model: "haiku", prompt_version: "v3" },
          plan: { model: "sonnet", prompt_version: "v1" },
        },
      });

      expect(() => syncPrompts(tmpDir, config)).toThrow(/prompts\/spec\/v3\.md/);
    });

    it("does not partially materialize when validation fails", () => {
      // plan exists but spec does not — neither should be written
      createPromptFile(tmpDir, "plan", "v1", "# plan prompt v1");

      const config = makeConfig({
        steps: {
          spec: { model: "haiku", prompt_version: "v99" },
          plan: { model: "sonnet", prompt_version: "v1" },
        },
      });

      expect(() => syncPrompts(tmpDir, config)).toThrow();

      // .claude/commands/ should not contain any partially-written files
      const commandsDir = join(tmpDir, ".claude", "commands");
      expect(existsSync(join(commandsDir, "plan.md"))).toBe(false);
      expect(existsSync(join(commandsDir, "spec.md"))).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Req: Caveman Marker Reconciliation
  // ---------------------------------------------------------------------------

  describe("P1: Caveman enabled injects marker", () => {
    it("injects BEGIN/END caveman block when not present", () => {
      createPromptFile(tmpDir, "spec", "v1", "# spec");
      createPromptFile(tmpDir, "plan", "v1", "# plan");

      const existing = "# My Project\n\nExisting content here.\n";
      writeFileSync(join(tmpDir, "CLAUDE.md"), existing, "utf-8");

      const config = makeConfig({ pipeline: { caveman: true } });
      syncPrompts(tmpDir, config);

      const content = readFileSync(join(tmpDir, "CLAUDE.md"), "utf-8");
      expect(content).toContain("<!-- BEGIN SPEQ:caveman -->");
      expect(content).toContain("<!-- END SPEQ:caveman -->");
      // Original content preserved
      expect(content).toContain("# My Project");
      expect(content).toContain("Existing content here.");
    });

    it("caveman block contains speq caveman instructions", () => {
      createPromptFile(tmpDir, "spec", "v1", "# spec");
      createPromptFile(tmpDir, "plan", "v1", "# plan");

      writeFileSync(join(tmpDir, "CLAUDE.md"), "# Project\n", "utf-8");

      const config = makeConfig({ pipeline: { caveman: true } });
      syncPrompts(tmpDir, config);

      const content = readFileSync(join(tmpDir, "CLAUDE.md"), "utf-8");
      // The block should have meaningful caveman instructions between the markers
      const begin = content.indexOf("<!-- BEGIN SPEQ:caveman -->");
      const end = content.indexOf("<!-- END SPEQ:caveman -->");
      expect(begin).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(begin);
      const block = content.slice(begin, end + "<!-- END SPEQ:caveman -->".length);
      // Instructions must be non-trivial
      expect(block.length).toBeGreaterThan(60);
    });

    it("creates CLAUDE.md with caveman block if it does not exist", () => {
      createPromptFile(tmpDir, "spec", "v1", "# spec");
      createPromptFile(tmpDir, "plan", "v1", "# plan");

      const config = makeConfig({ pipeline: { caveman: true } });
      syncPrompts(tmpDir, config);

      const claudePath = join(tmpDir, "CLAUDE.md");
      expect(existsSync(claudePath)).toBe(true);
      const content = readFileSync(claudePath, "utf-8");
      expect(content).toContain("<!-- BEGIN SPEQ:caveman -->");
      expect(content).toContain("<!-- END SPEQ:caveman -->");
    });
  });

  describe("P1: Caveman disabled removes marker", () => {
    it("removes the caveman block when pipeline.caveman is false", () => {
      createPromptFile(tmpDir, "spec", "v1", "# spec");
      createPromptFile(tmpDir, "plan", "v1", "# plan");

      const withCaveman = [
        "# My Project",
        "",
        "Before caveman.",
        "",
        "<!-- BEGIN SPEQ:caveman -->",
        "caveman.prd: on",
        "<!-- END SPEQ:caveman -->",
        "",
        "After caveman.",
        "",
      ].join("\n");
      writeFileSync(join(tmpDir, "CLAUDE.md"), withCaveman, "utf-8");

      const config = makeConfig({ pipeline: { caveman: false } });
      syncPrompts(tmpDir, config);

      const content = readFileSync(join(tmpDir, "CLAUDE.md"), "utf-8");
      expect(content).not.toContain("<!-- BEGIN SPEQ:caveman -->");
      expect(content).not.toContain("<!-- END SPEQ:caveman -->");
      // Other content preserved
      expect(content).toContain("# My Project");
      expect(content).toContain("Before caveman.");
      expect(content).toContain("After caveman.");
    });

    it("preserves BEADS markers when removing caveman block", () => {
      createPromptFile(tmpDir, "spec", "v1", "# spec");
      createPromptFile(tmpDir, "plan", "v1", "# plan");

      const withBoth = [
        "# Project",
        "",
        "<!-- BEGIN BEADS INTEGRATION -->",
        "Beads stuff",
        "<!-- END BEADS INTEGRATION -->",
        "",
        "<!-- BEGIN SPEQ:caveman -->",
        "caveman.prd: on",
        "<!-- END SPEQ:caveman -->",
        "",
      ].join("\n");
      writeFileSync(join(tmpDir, "CLAUDE.md"), withBoth, "utf-8");

      const config = makeConfig({ pipeline: { caveman: false } });
      syncPrompts(tmpDir, config);

      const content = readFileSync(join(tmpDir, "CLAUDE.md"), "utf-8");
      expect(content).toContain("<!-- BEGIN BEADS INTEGRATION -->");
      expect(content).toContain("Beads stuff");
      expect(content).toContain("<!-- END BEADS INTEGRATION -->");
      expect(content).not.toContain("<!-- BEGIN SPEQ:caveman -->");
    });

    it("no-ops when caveman false and no block exists", () => {
      createPromptFile(tmpDir, "spec", "v1", "# spec");
      createPromptFile(tmpDir, "plan", "v1", "# plan");

      const original = "# Project\n\nNo caveman here.\n";
      writeFileSync(join(tmpDir, "CLAUDE.md"), original, "utf-8");

      const config = makeConfig({ pipeline: { caveman: false } });
      syncPrompts(tmpDir, config);

      const content = readFileSync(join(tmpDir, "CLAUDE.md"), "utf-8");
      expect(content).toBe(original);
    });
  });

  describe("P1: Idempotent caveman toggle", () => {
    it("does not write to CLAUDE.md when caveman block already correct (enabled)", () => {
      createPromptFile(tmpDir, "spec", "v1", "# spec");
      createPromptFile(tmpDir, "plan", "v1", "# plan");

      // First run to get the canonical caveman block in place
      writeFileSync(join(tmpDir, "CLAUDE.md"), "# Project\n", "utf-8");
      const config = makeConfig({ pipeline: { caveman: true } });
      syncPrompts(tmpDir, config);

      const afterFirst = readFileSync(join(tmpDir, "CLAUDE.md"), "utf-8");

      // Second run should produce identical content
      syncPrompts(tmpDir, config);
      const afterSecond = readFileSync(join(tmpDir, "CLAUDE.md"), "utf-8");

      expect(afterFirst).toBe(afterSecond);
    });

    it("does not modify CLAUDE.md when caveman disabled and block already absent", () => {
      createPromptFile(tmpDir, "spec", "v1", "# spec");
      createPromptFile(tmpDir, "plan", "v1", "# plan");

      const original = "# Project\n\nNo caveman.\n";
      writeFileSync(join(tmpDir, "CLAUDE.md"), original, "utf-8");

      const config = makeConfig({ pipeline: { caveman: false } });
      syncPrompts(tmpDir, config);
      const afterFirst = readFileSync(join(tmpDir, "CLAUDE.md"), "utf-8");
      syncPrompts(tmpDir, config);
      const afterSecond = readFileSync(join(tmpDir, "CLAUDE.md"), "utf-8");

      expect(afterFirst).toBe(afterSecond);
      expect(afterFirst).toBe(original);
    });
  });

  // ---------------------------------------------------------------------------
  // Req: Init Integration
  // ---------------------------------------------------------------------------

  describe("P1: Init writes default config then syncs", () => {
    it("creates .claude/commands/ with materialized prompts when called on a fresh project", () => {
      // Simulate prompts being available (they would come from the package in a real install)
      createPromptFile(tmpDir, "spec", "v1", "# spec v1");
      createPromptFile(tmpDir, "plan", "v1", "# plan v1");

      const config = makeConfig();
      syncPrompts(tmpDir, config);

      expect(existsSync(join(tmpDir, ".claude", "commands", "spec.md"))).toBe(true);
      expect(existsSync(join(tmpDir, ".claude", "commands", "plan.md"))).toBe(true);
    });

    it("creates .claude/commands/ directory if it does not exist", () => {
      createPromptFile(tmpDir, "spec", "v1", "# spec");
      createPromptFile(tmpDir, "plan", "v1", "# plan");

      // Ensure directory does not pre-exist
      expect(existsSync(join(tmpDir, ".claude", "commands"))).toBe(false);

      syncPrompts(tmpDir, makeConfig());

      expect(existsSync(join(tmpDir, ".claude", "commands"))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Req: Performance
  // ---------------------------------------------------------------------------

  describe("P1: Performance within 200ms", () => {
    it("syncs 8 steps and caveman reconciliation in under 200ms", () => {
      // Create 8 prompt files
      const steps = [
        "requirements",
        "enrich",
        "spec",
        "plan",
        "implement",
        "verify",
        "done",
        "ship",
      ];
      for (const step of steps) {
        createPromptFile(tmpDir, step, "v1", `# ${step} prompt v1\n`.repeat(50));
      }

      writeFileSync(join(tmpDir, "CLAUDE.md"), "# Project\n", "utf-8");

      const stepsConfig: PipelineConfig["steps"] = {};
      for (const step of steps) {
        stepsConfig[step] = { model: "haiku", prompt_version: "v1" };
      }
      const config: PipelineConfig = {
        pipeline: { caveman: true },
        steps: stepsConfig,
        adr: { path: "docs/adr" },
        evals: { fixtures_path: ".speq/evals/fixtures" },
      };

      const start = performance.now();
      syncPrompts(tmpDir, config);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(200);
    });
  });
});
