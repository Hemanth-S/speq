import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdtempSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { addAdr, listAdrs, supersedeAdr } from "../src/adr.js";
import type { AdrEntry } from "../src/adr.js";

let TEST_DIR: string;

beforeEach(() => {
  TEST_DIR = mkdtempSync(join(tmpdir(), "speq-adr-test-"));
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

// Helper: write a minimal ADR file into the given adr directory
function writeAdrFile(
  adrDir: string,
  filename: string,
  id: number,
  status: "draft" | "active" | "superseded",
  title: string,
  supersedes: number | null = null,
) {
  mkdirSync(adrDir, { recursive: true });
  const content = `---
id: ${id}
status: ${status}
supersedes: ${supersedes === null ? "null" : supersedes}
tags: []
---
# ${id}. ${title}

## Context
[To be filled]

## Decision
[To be filled]

## Consequences
[To be filled]
`;
  writeFileSync(join(adrDir, filename), content, "utf-8");
}

// ---------------------------------------------------------------------------
// ADR Creation
// ---------------------------------------------------------------------------

describe("ADR Creation", () => {
  describe("New ADR created with sequential numbering [P1]", () => {
    it("creates 0003-use-yaml-for-config.md when 0001 and 0002 already exist", () => {
      const adrDir = join(TEST_DIR, "docs", "adr");
      writeAdrFile(adrDir, "0001-use-typescript.md", 1, "active", "Use TypeScript");
      writeAdrFile(adrDir, "0002-use-vitest.md", 2, "active", "Use Vitest");

      const result = addAdr(TEST_DIR, "Use YAML for config");

      expect(result.id).toBe(3);
      expect(existsSync(join(adrDir, "0003-use-yaml-for-config.md"))).toBe(true);
      expect(result.path).toBe(join(adrDir, "0003-use-yaml-for-config.md"));

      const content = readFileSync(result.path, "utf-8");
      expect(content).toContain("id: 3");
      expect(content).toContain("status: draft");
      expect(content).toContain("tags: []");
      expect(content).toContain("## Context");
      expect(content).toContain("## Decision");
      expect(content).toContain("## Consequences");
    });
  });

  describe("First ADR in empty directory [P1]", () => {
    it("creates docs/adr/ and writes 0001-use-typescript.md", () => {
      const adrDir = join(TEST_DIR, "docs", "adr");
      expect(existsSync(adrDir)).toBe(false);

      const result = addAdr(TEST_DIR, "Use TypeScript");

      expect(existsSync(adrDir)).toBe(true);
      expect(result.id).toBe(1);
      expect(existsSync(join(adrDir, "0001-use-typescript.md"))).toBe(true);

      const content = readFileSync(result.path, "utf-8");
      expect(content).toContain("id: 1");
      expect(content).toContain("status: draft");
    });
  });

  describe("Duplicate title creates new sequential ADR [P1]", () => {
    it("creates 0002-use-typescript.md without overwriting 0001", () => {
      const adrDir = join(TEST_DIR, "docs", "adr");
      writeAdrFile(adrDir, "0001-use-typescript.md", 1, "draft", "Use TypeScript");

      const result = addAdr(TEST_DIR, "Use TypeScript");

      expect(result.id).toBe(2);
      expect(existsSync(join(adrDir, "0001-use-typescript.md"))).toBe(true);
      expect(existsSync(join(adrDir, "0002-use-typescript.md"))).toBe(true);
    });
  });

  describe("Title with shell metacharacters sanitized [P0]", () => {
    it('sanitizes "Use Redis; rm -rf /" to slug use-redis-rm-rf', () => {
      const result = addAdr(TEST_DIR, "Use Redis; rm -rf /");

      const adrDir = join(TEST_DIR, "docs", "adr");
      expect(result.id).toBe(1);
      expect(existsSync(join(adrDir, "0001-use-redis-rm-rf.md"))).toBe(true);

      // Verify no shell execution side-effects (root still exists, no damage)
      const content = readFileSync(result.path, "utf-8");
      expect(content).toContain("id: 1");
    });

    it("collapses multiple hyphens and trims leading/trailing hyphens", () => {
      const result = addAdr(TEST_DIR, "---Use  Redis---");

      const adrDir = join(TEST_DIR, "docs", "adr");
      // slug: 'use-redis' after collapsing and trimming
      expect(existsSync(result.path)).toBe(true);
      const filename = result.path.split("/").pop()!;
      // Should not start or end with hyphens after the numeric prefix
      const slug = filename.replace(/^\d{4}-/, "").replace(/\.md$/, "");
      expect(slug).not.toMatch(/^-/);
      expect(slug).not.toMatch(/-$/);
      expect(slug).not.toMatch(/--/);
    });
  });
});

// ---------------------------------------------------------------------------
// ADR Listing
// ---------------------------------------------------------------------------

describe("ADR Listing", () => {
  describe("List shows all ADRs sorted by id [P1]", () => {
    it("returns 3 entries with correct id/status/title", () => {
      const adrDir = join(TEST_DIR, "docs", "adr");
      writeAdrFile(adrDir, "0003-use-yaml.md", 3, "superseded", "Use YAML");
      writeAdrFile(adrDir, "0001-use-typescript.md", 1, "draft", "Use TypeScript");
      writeAdrFile(adrDir, "0002-use-vitest.md", 2, "active", "Use Vitest");

      const entries = listAdrs(TEST_DIR);

      expect(entries).toHaveLength(3);
      expect(entries[0].id).toBe(1);
      expect(entries[0].status).toBe("draft");
      expect(entries[0].title).toBe("Use TypeScript");

      expect(entries[1].id).toBe(2);
      expect(entries[1].status).toBe("active");
      expect(entries[1].title).toBe("Use Vitest");

      expect(entries[2].id).toBe(3);
      expect(entries[2].status).toBe("superseded");
      expect(entries[2].title).toBe("Use YAML");
    });

    it("each entry has a valid path", () => {
      const adrDir = join(TEST_DIR, "docs", "adr");
      writeAdrFile(adrDir, "0001-use-typescript.md", 1, "active", "Use TypeScript");

      const entries = listAdrs(TEST_DIR);

      expect(entries[0].path).toBe(join(adrDir, "0001-use-typescript.md"));
    });
  });

  describe("Empty directory listed gracefully [P2]", () => {
    it("returns empty array when docs/adr/ does not exist", () => {
      const entries = listAdrs(TEST_DIR);
      expect(entries).toEqual([]);
    });

    it("returns empty array when docs/adr/ exists but has no ADR files", () => {
      const adrDir = join(TEST_DIR, "docs", "adr");
      mkdirSync(adrDir, { recursive: true });
      // Write a non-ADR file to make sure we don't pick it up
      writeFileSync(join(adrDir, "README.md"), "# ADRs\n", "utf-8");

      const entries = listAdrs(TEST_DIR);
      expect(entries).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// ADR Supersession
// ---------------------------------------------------------------------------

describe("ADR Supersession", () => {
  describe("Supersede creates successor and retires original [P1]", () => {
    it("marks 0002 as superseded and creates 0003 with supersedes: 2", () => {
      const adrDir = join(TEST_DIR, "docs", "adr");
      writeAdrFile(adrDir, "0001-use-typescript.md", 1, "active", "Use TypeScript");
      writeAdrFile(adrDir, "0002-use-vitest.md", 2, "active", "Use Vitest");

      const result = supersedeAdr(TEST_DIR, 2, "Switch to node:test");

      // Old file updated to superseded
      const oldContent = readFileSync(result.oldPath, "utf-8");
      expect(oldContent).toContain("status: superseded");

      // New file created
      expect(existsSync(result.newPath)).toBe(true);
      const newContent = readFileSync(result.newPath, "utf-8");
      expect(newContent).toContain("status: draft");
      expect(newContent).toContain("supersedes: 2");
      expect(newContent).toContain("id: 3");

      // Both files exist
      expect(existsSync(result.oldPath)).toBe(true);
      expect(existsSync(result.newPath)).toBe(true);
    });
  });

  describe("Cannot supersede non-active ADR [P1]", () => {
    it("throws an error when ADR is in draft status", () => {
      const adrDir = join(TEST_DIR, "docs", "adr");
      writeAdrFile(adrDir, "0001-use-typescript.md", 1, "draft", "Use TypeScript");

      expect(() => supersedeAdr(TEST_DIR, 1, "Switch to Go")).toThrow(
        "ADR 0001 is draft, not active — only active ADRs can be superseded",
      );

      // No files changed
      const content = readFileSync(join(adrDir, "0001-use-typescript.md"), "utf-8");
      expect(content).toContain("status: draft");
    });

    it("throws an error when ADR is already superseded", () => {
      const adrDir = join(TEST_DIR, "docs", "adr");
      writeAdrFile(adrDir, "0001-use-typescript.md", 1, "superseded", "Use TypeScript");

      expect(() => supersedeAdr(TEST_DIR, 1, "Switch to Go")).toThrow(
        "ADR 0001 is superseded, not active — only active ADRs can be superseded",
      );
    });

    it("throws an error when ADR id does not exist", () => {
      const adrDir = join(TEST_DIR, "docs", "adr");
      writeAdrFile(adrDir, "0001-use-typescript.md", 1, "active", "Use TypeScript");

      expect(() => supersedeAdr(TEST_DIR, 99, "Switch to Go")).toThrow();
    });
  });

  describe("Custom ADR path from config respected [P2]", () => {
    it("creates ADR in custom path when adrPath is provided", () => {
      const customPath = "architecture/decisions";
      const adrDir = join(TEST_DIR, customPath);

      const result = addAdr(TEST_DIR, "Custom path test", customPath);

      expect(existsSync(adrDir)).toBe(true);
      expect(result.path).toBe(join(adrDir, "0001-custom-path-test.md"));
      expect(existsSync(result.path)).toBe(true);
    });

    it("listAdrs uses custom adrPath", () => {
      const customPath = "architecture/decisions";
      const adrDir = join(TEST_DIR, customPath);
      writeAdrFile(adrDir, "0001-custom-path-test.md", 1, "draft", "Custom path test");

      const entries = listAdrs(TEST_DIR, customPath);

      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe(1);
      expect(entries[0].path).toBe(join(adrDir, "0001-custom-path-test.md"));
    });

    it("does not find ADRs in default path when custom path is used", () => {
      const customPath = "architecture/decisions";
      const defaultAdrDir = join(TEST_DIR, "docs", "adr");
      writeAdrFile(defaultAdrDir, "0001-use-typescript.md", 1, "active", "Use TypeScript");

      // List with custom path — should find nothing there
      const entries = listAdrs(TEST_DIR, customPath);
      expect(entries).toEqual([]);
    });
  });
});
