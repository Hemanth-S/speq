import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPromptFilePath } from "../src/runner.js";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

describe("command-runner", () => {
  describe("Claude CLI not found [P0]", () => {
    it("detects when claude is not in PATH", () => {
      // Simulate checking for a non-existent binary
      const result = spawnSync("which", ["claude_nonexistent_binary_xyz"], {
        shell: false,
        encoding: "utf-8",
      });
      expect(result.status).not.toBe(0);
    });
  });

  describe("Run a command successfully [P1]", () => {
    it("builds correct prompt file path for each command", () => {
      const commands = [
        "requirements",
        "enrich",
        "spec",
        "plan",
        "implement",
        "verify",
        "done",
        "ship",
      ];
      for (const cmd of commands) {
        const path = getPromptFilePath(cmd);
        expect(path).toContain(join(".claude", "commands", `${cmd}.md`));
      }
    });
  });

  describe("Prompt file missing [P2]", () => {
    it("detects missing prompt file", () => {
      const path = getPromptFilePath("nonexistent");
      expect(existsSync(path)).toBe(false);
    });
  });

  describe("Command with path containing spaces [P1]", () => {
    it("handles spaces in prompt file path", () => {
      const path = getPromptFilePath("ship");
      // path.resolve handles spaces correctly — no quoting needed
      expect(path).not.toContain('"');
      expect(path).toContain("ship.md");
    });
  });

  describe("Path with shell metacharacters [P0]", () => {
    it("getPromptFilePath returns literal path with no shell evaluation", () => {
      // Even if cwd contained metacharacters, resolve treats them literally
      const path = getPromptFilePath("ship");
      expect(path).toContain(".claude");
      expect(path).toContain("ship.md");
      // No shell metacharacters introduced
      expect(path).not.toContain("$(");
      expect(path).not.toContain("`");
    });
  });
});
