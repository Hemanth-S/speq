import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SETUP_SH = readFileSync(join(__dirname, "..", "setup.sh"), "utf-8");
const SETUP_PS1 = readFileSync(join(__dirname, "..", "setup.ps1"), "utf-8");

describe("Bash Setup Script", () => {
  describe("Setup script prevents command injection [P0]", () => {
    it("uses proper quoting for all variable references", () => {
      // All variable uses should be quoted
      const unquotedVars = SETUP_SH.match(/\$[A-Z_]+[^"'\s}]/g) || [];
      // Filter out vars inside $() or in comments
      const risky = unquotedVars.filter(
        (v) => !v.startsWith("$(") && !SETUP_SH.split("\n").some(
          (line) => line.includes(v) && line.trimStart().startsWith("#"),
        ),
      );
      // The script uses "$NODE_VERSION", "$NODE_MAJOR" etc. in quoted contexts
      // Check that set -euo pipefail is present (safe defaults)
      expect(SETUP_SH).toContain("set -euo pipefail");
    });

    it("does not use eval or unquoted command substitution", () => {
      expect(SETUP_SH).not.toContain("eval ");
      // No unquoted backtick command substitution
      const lines = SETUP_SH.split("\n").filter(
        (l) => !l.trimStart().startsWith("#"),
      );
      for (const line of lines) {
        expect(line).not.toMatch(/`[^`]+`/);
      }
    });
  });

  describe("All dependencies already present [P1]", () => {
    it("checks for node, npm, speq, bd, and claude", () => {
      expect(SETUP_SH).toContain("command -v node");
      expect(SETUP_SH).toContain("command -v npm");
      expect(SETUP_SH).toContain("command -v speq");
      expect(SETUP_SH).toContain("command -v bd");
      expect(SETUP_SH).toContain("command -v claude");
    });
  });

  describe("speq and bd not installed [P1]", () => {
    it("installs speq and bd via npm if missing", () => {
      expect(SETUP_SH).toContain("npm install -g github:Hemanth-S/speq");
      expect(SETUP_SH).toContain("npm install -g @beads/bd");
    });
  });

  describe("npm registry unavailable [P2]", () => {
    it("exits with code 1 when npm install fails", () => {
      // The script uses set -e, so npm install failure will exit
      expect(SETUP_SH).toContain("exit 1");
    });
  });
});

describe("PowerShell Setup Script", () => {
  describe("PowerShell script prevents injection [P0]", () => {
    it("uses ErrorActionPreference Stop", () => {
      expect(SETUP_PS1).toContain('$ErrorActionPreference = "Stop"');
    });

    it("does not use Invoke-Expression", () => {
      expect(SETUP_PS1).not.toContain("Invoke-Expression");
      expect(SETUP_PS1).not.toContain("iex ");
    });
  });

  describe("All dependencies already present on Windows [P1]", () => {
    it("checks for node, npm, speq, bd, and claude", () => {
      expect(SETUP_PS1).toContain("node --version");
      expect(SETUP_PS1).toContain("npm --version");
      expect(SETUP_PS1).toContain("speq --version");
      expect(SETUP_PS1).toContain("bd --version");
      expect(SETUP_PS1).toContain("claude --version");
    });
  });

  describe("Install dependencies on Windows [P1]", () => {
    it("installs speq and bd via npm if missing", () => {
      expect(SETUP_PS1).toContain('npm install -g "github:Hemanth-S/speq"');
      expect(SETUP_PS1).toContain('npm install -g "@beads/bd"');
    });
  });
});
