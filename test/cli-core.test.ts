import { describe, it, expect } from "vitest";
import { run } from "../src/cli.js";

describe("cli-core", () => {
  describe("Unknown command [P0]", () => {
    it("prints error and exits 1 for unknown command", () => {
      const result = run(["nonexistent"]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Unknown command: nonexistent");
      expect(result.stderr).toContain("Run speq --help for usage information");
      expect(result.stderr).not.toMatch(/\/.+\/.+\.ts/);
      expect(result.stderr).not.toMatch(/at\s+\w+\s+\(/);
    });
  });

  describe("Display version [P1]", () => {
    it("prints version from package.json and exits 0", () => {
      const result = run(["--version"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/^\d+\.\d+\.\d+$/);
      expect(result.stderr).toBe("");
    });
  });

  describe("Display help [P1]", () => {
    it("prints usage with all commands and exits 0", () => {
      const result = run(["--help"]);

      expect(result.exitCode).toBe(0);
      const commands = [
        "init",
        "requirements",
        "enrich",
        "spec",
        "plan",
        "implement",
        "verify",
        "done",
        "ship",
        "resume",
      ];
      for (const cmd of commands) {
        expect(result.stdout).toContain(cmd);
      }
      expect(result.stderr).toBe("");
    });
  });

  describe("No arguments [P1]", () => {
    it("prints help output and exits 0 when no args given", () => {
      const result = run([]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Usage:");
      expect(result.stdout).toContain("Commands:");
      expect(result.stderr).toBe("");
    });
  });

  describe("CLI startup performance [P1]", () => {
    it("completes --version in under 200ms", () => {
      const start = performance.now();
      run(["--version"]);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(200);
    });
  });
});
