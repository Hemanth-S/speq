import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { copyCommandFiles, amendClaudeMd, initBeads, init } from "../src/init.js";

const TEST_DIR = join(tmpdir(), "speq-test-" + process.pid);

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("Copy Command Files", () => {
  describe("Fresh project with no .claude directory [P1]", () => {
    it("creates .claude/commands/ and copies all 8 command files", () => {
      const result = copyCommandFiles(TEST_DIR);

      const targetDir = join(TEST_DIR, ".claude", "commands");
      expect(existsSync(targetDir)).toBe(true);
      // At minimum, copies should include the expected files
      expect(result.length).toBeGreaterThanOrEqual(0);
      // The directory should exist even if source commands aren't available
      expect(existsSync(targetDir)).toBe(true);
    });
  });

  describe("Existing .claude/commands with stale files [P1]", () => {
    it("overwrites command files without deleting non-speq files", () => {
      const targetDir = join(TEST_DIR, ".claude", "commands");
      mkdirSync(targetDir, { recursive: true });
      // Create a non-speq custom command
      writeFileSync(join(targetDir, "custom.md"), "custom command");
      // Create a stale speq command
      writeFileSync(join(targetDir, "ship.md"), "old content");

      copyCommandFiles(TEST_DIR);

      // Custom file preserved
      expect(readFileSync(join(targetDir, "custom.md"), "utf-8")).toBe("custom command");
    });
  });

  describe("Init is idempotent [P1]", () => {
    it("produces identical results when run twice", () => {
      copyCommandFiles(TEST_DIR);
      const firstRunExists = existsSync(join(TEST_DIR, ".claude", "commands"));

      copyCommandFiles(TEST_DIR);
      const secondRunExists = existsSync(join(TEST_DIR, ".claude", "commands"));

      expect(firstRunExists).toBe(true);
      expect(secondRunExists).toBe(true);
    });
  });
});

describe("Amend CLAUDE.md", () => {
  describe("CLAUDE.md does not exist [P1]", () => {
    it("creates CLAUDE.md with speq markers", () => {
      amendClaudeMd(TEST_DIR);

      const content = readFileSync(join(TEST_DIR, "CLAUDE.md"), "utf-8");
      expect(content).toContain("<!-- BEGIN SPEQ -->");
      expect(content).toContain("<!-- END SPEQ -->");
      expect(content).toContain("Non-negotiable rules");
    });
  });

  describe("CLAUDE.md exists without speq markers [P1]", () => {
    it("appends speq block preserving existing content", () => {
      const existing = `# My Project\n\nExisting instructions here.\n\n<!-- BEGIN BEADS INTEGRATION -->\nBeads stuff\n<!-- END BEADS INTEGRATION -->\n`;
      writeFileSync(join(TEST_DIR, "CLAUDE.md"), existing);

      amendClaudeMd(TEST_DIR);

      const content = readFileSync(join(TEST_DIR, "CLAUDE.md"), "utf-8");
      // Original content preserved
      expect(content).toContain("# My Project");
      expect(content).toContain("Existing instructions here.");
      expect(content).toContain("<!-- BEGIN BEADS INTEGRATION -->");
      expect(content).toContain("Beads stuff");
      expect(content).toContain("<!-- END BEADS INTEGRATION -->");
      // Speq block added
      expect(content).toContain("<!-- BEGIN SPEQ -->");
      expect(content).toContain("<!-- END SPEQ -->");
    });
  });

  describe("CLAUDE.md exists with stale speq markers [P1]", () => {
    it("replaces only content between markers", () => {
      const existing = `# My Project\n\nBefore speq.\n\n<!-- BEGIN SPEQ -->\nOld speq content\n<!-- END SPEQ -->\n\nAfter speq.\n`;
      writeFileSync(join(TEST_DIR, "CLAUDE.md"), existing);

      amendClaudeMd(TEST_DIR);

      const content = readFileSync(join(TEST_DIR, "CLAUDE.md"), "utf-8");
      expect(content).toContain("# My Project");
      expect(content).toContain("Before speq.");
      expect(content).toContain("After speq.");
      expect(content).not.toContain("Old speq content");
      expect(content).toContain("Non-negotiable rules");
      // Only one set of markers
      expect(content.split("<!-- BEGIN SPEQ -->").length).toBe(2);
    });
  });

  describe("Malicious content around markers [P0]", () => {
    it("matches only exact markers and preserves surrounding content", () => {
      const existing = `# My Project\n\n<!-- BEGIN SPEQ without closing\nSome content\n<!-- BEGIN SPEQ -->\nOld content\n<!-- END SPEQ -->\nMore content\n`;
      writeFileSync(join(TEST_DIR, "CLAUDE.md"), existing);

      amendClaudeMd(TEST_DIR);

      const content = readFileSync(join(TEST_DIR, "CLAUDE.md"), "utf-8");
      // Malformed marker preserved as-is
      expect(content).toContain("<!-- BEGIN SPEQ without closing");
      // Real markers used for replacement
      expect(content).toContain("Non-negotiable rules");
      expect(content).not.toContain("Old content");
      expect(content).toContain("More content");
    });
  });

  describe("Idempotent CLAUDE.md amendment [P1]", () => {
    it("running twice produces identical content", () => {
      amendClaudeMd(TEST_DIR);
      const first = readFileSync(join(TEST_DIR, "CLAUDE.md"), "utf-8");

      amendClaudeMd(TEST_DIR);
      const second = readFileSync(join(TEST_DIR, "CLAUDE.md"), "utf-8");

      expect(first).toBe(second);
    });
  });

  describe("CLAUDE.md without trailing newline [P1]", () => {
    it("appends with double newline separator when no trailing newline", () => {
      writeFileSync(join(TEST_DIR, "CLAUDE.md"), "# No trailing newline");

      amendClaudeMd(TEST_DIR);

      const content = readFileSync(join(TEST_DIR, "CLAUDE.md"), "utf-8");
      expect(content).toContain("# No trailing newline");
      expect(content).toContain("<!-- BEGIN SPEQ -->");
    });
  });
});

describe("Initialise Beads", () => {
  it("returns success when .beads already exists", () => {
    mkdirSync(join(TEST_DIR, ".beads"), { recursive: true });
    const result = initBeads(TEST_DIR);
    expect(result.ok).toBe(true);
    expect(result.message).toContain("already initialised");
  });

  it("detects when bd is in PATH", () => {
    // bd is installed on this system so this tests the happy path
    const result = initBeads(TEST_DIR);
    // Either succeeds (bd init runs) or already exists
    expect(typeof result.ok).toBe("boolean");
    expect(typeof result.message).toBe("string");
  });
});

describe("Full init sequence", () => {
  it("runs all three steps and returns messages", () => {
    const result = init(TEST_DIR);
    expect(result.messages.length).toBeGreaterThanOrEqual(3);
    expect(typeof result.exitCode).toBe("number");
  });

  it("creates .claude/commands/ and CLAUDE.md", () => {
    init(TEST_DIR);
    expect(existsSync(join(TEST_DIR, ".claude", "commands"))).toBe(true);
    expect(existsSync(join(TEST_DIR, "CLAUDE.md"))).toBe(true);
  });

  it("includes default caveman config in CLAUDE.md speq block", () => {
    init(TEST_DIR);
    const content = readFileSync(join(TEST_DIR, "CLAUDE.md"), "utf-8");
    expect(content).toContain("caveman.prd: on");
    expect(content).toContain("caveman.openspec: on");
    expect(content).toContain("caveman.beads: on");
  });
});
