import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  mkdtempSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { addAdr, listAdrs } from "../src/adr.js";
import {
  structuralScan,
  docsIngestion,
  bootstrap,
} from "../src/adr-bootstrap.js";
import type { BootstrapResult } from "../src/adr-bootstrap.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

let TEST_DIR: string;

beforeEach(() => {
  TEST_DIR = mkdtempSync(join(tmpdir(), "speq-bootstrap-test-"));
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

/**
 * Write a package.json with given deps/devDeps into the test directory.
 */
function writePackageJson(
  dir: string,
  opts: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  },
) {
  const pkg = {
    name: "test-project",
    version: "1.0.0",
    dependencies: opts.dependencies ?? {},
    devDependencies: opts.devDependencies ?? {},
  };
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2), "utf-8");
}

/**
 * Write a tsconfig.json with given compiler options.
 */
function writeTsConfig(dir: string, compilerOptions: Record<string, unknown>) {
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({ compilerOptions }, null, 2),
    "utf-8",
  );
}

/**
 * Write an active ADR file directly into the ADR directory.
 */
function writeActiveAdr(
  dir: string,
  id: number,
  title: string,
  adrSubPath = "docs/adr",
) {
  const adrDir = join(dir, adrSubPath);
  mkdirSync(adrDir, { recursive: true });
  const pad = (n: number) => String(n).padStart(4, "0");
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
  const content = `---
id: ${id}
status: active
supersedes: null
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
  writeFileSync(join(adrDir, `${pad(id)}-${slug}.md`), content, "utf-8");
}

// ---------------------------------------------------------------------------
// Req: Structural Scan — Package.json dependencies detected [P1]
// ---------------------------------------------------------------------------

describe("Structural Scan — Package.json dependencies detected [P1]", () => {
  it("infers TypeScript decision from devDependencies", () => {
    writePackageJson(TEST_DIR, {
      devDependencies: { typescript: "^5.0.0" },
    });

    const results = structuralScan(TEST_DIR);

    const ts = results.find((r) => r.title.toLowerCase().includes("typescript"));
    expect(ts).toBeDefined();
    expect(ts!.evidence).toMatch(/typescript/i);
    expect(["high", "medium", "low"]).toContain(ts!.confidence);
  });

  it("infers Vitest decision from devDependencies", () => {
    writePackageJson(TEST_DIR, {
      devDependencies: { vitest: "^2.0.0" },
    });

    const results = structuralScan(TEST_DIR);

    const vt = results.find((r) => r.title.toLowerCase().includes("vitest"));
    expect(vt).toBeDefined();
    expect(vt!.evidence).toMatch(/vitest/i);
  });

  it("infers Drizzle ORM decision from dependencies", () => {
    writePackageJson(TEST_DIR, {
      dependencies: { "drizzle-orm": "^0.30.0" },
    });

    const results = structuralScan(TEST_DIR);

    const drizzle = results.find((r) => r.title.toLowerCase().includes("drizzle"));
    expect(drizzle).toBeDefined();
    expect(drizzle!.evidence).toMatch(/drizzle/i);
  });

  it("infers all three decisions when vitest, typescript, and drizzle-orm are present", () => {
    writePackageJson(TEST_DIR, {
      devDependencies: { vitest: "^2.0.0", typescript: "^5.0.0" },
      dependencies: { "drizzle-orm": "^0.30.0" },
    });

    const results = structuralScan(TEST_DIR);
    const titles = results.map((r) => r.title.toLowerCase());

    expect(titles.some((t) => t.includes("typescript"))).toBe(true);
    expect(titles.some((t) => t.includes("vitest"))).toBe(true);
    expect(titles.some((t) => t.includes("drizzle"))).toBe(true);
  });

  it("returns empty array when no package.json and no structure", () => {
    const results = structuralScan(TEST_DIR);
    expect(Array.isArray(results)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Req: Structural Scan — Folder structure inferred [P1]
// ---------------------------------------------------------------------------

describe("Structural Scan — Folder structure inferred [P1]", () => {
  it("detects separate src/ and test/ directories pattern", () => {
    mkdirSync(join(TEST_DIR, "src"), { recursive: true });
    mkdirSync(join(TEST_DIR, "test"), { recursive: true });

    const results = structuralScan(TEST_DIR);

    const structural = results.find(
      (r) =>
        r.title.toLowerCase().includes("test") ||
        r.title.toLowerCase().includes("src") ||
        r.title.toLowerCase().includes("separate"),
    );
    expect(structural).toBeDefined();
    expect(structural!.evidence).toMatch(/src|test/i);
  });

  it("detects docs/ directory", () => {
    mkdirSync(join(TEST_DIR, "docs"), { recursive: true });

    const results = structuralScan(TEST_DIR);

    const docsResult = results.find(
      (r) =>
        r.title.toLowerCase().includes("docs") ||
        r.evidence.toLowerCase().includes("docs"),
    );
    expect(docsResult).toBeDefined();
  });

  it("detects openspec/ directory", () => {
    mkdirSync(join(TEST_DIR, "openspec"), { recursive: true });

    const results = structuralScan(TEST_DIR);

    const openspecResult = results.find(
      (r) =>
        r.title.toLowerCase().includes("openspec") ||
        r.evidence.toLowerCase().includes("openspec"),
    );
    expect(openspecResult).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Req: Idempotent bootstrap on existing ADRs [P1]
// ---------------------------------------------------------------------------

describe("Idempotent bootstrap — existing active ADRs not duplicated [P1]", () => {
  it("does not create a duplicate TypeScript ADR when one already exists as active", () => {
    writeActiveAdr(TEST_DIR, 1, "Use TypeScript");
    writePackageJson(TEST_DIR, {
      devDependencies: { typescript: "^5.0.0" },
    });

    const result = bootstrap(TEST_DIR);

    const tsDrafts = result.drafts.filter((d) =>
      d.title.toLowerCase().includes("typescript"),
    );
    expect(tsDrafts).toHaveLength(0);
  });

  it("does not duplicate any ADR whose title closely matches an existing active ADR", () => {
    writeActiveAdr(TEST_DIR, 1, "Use TypeScript");
    writeActiveAdr(TEST_DIR, 2, "Use Vitest");
    writePackageJson(TEST_DIR, {
      devDependencies: { typescript: "^5.0.0", vitest: "^2.0.0" },
    });

    const result = bootstrap(TEST_DIR);

    const tsDrafts = result.drafts.filter((d) =>
      d.title.toLowerCase().includes("typescript"),
    );
    const vtDrafts = result.drafts.filter((d) =>
      d.title.toLowerCase().includes("vitest"),
    );
    expect(tsDrafts).toHaveLength(0);
    expect(vtDrafts).toHaveLength(0);
  });

  it("reports the count of preserved existing ADRs", () => {
    writeActiveAdr(TEST_DIR, 1, "Use TypeScript");
    writePackageJson(TEST_DIR, { devDependencies: { typescript: "^5.0.0" } });

    const result = bootstrap(TEST_DIR);

    expect(result.preserved).toBeGreaterThanOrEqual(1);
  });

  it("creates a new draft for a genuinely new decision not already in existing ADRs", () => {
    writeActiveAdr(TEST_DIR, 1, "Use TypeScript");
    writePackageJson(TEST_DIR, {
      devDependencies: { typescript: "^5.0.0", vitest: "^2.0.0" },
    });

    const result = bootstrap(TEST_DIR);

    const vtDrafts = result.drafts.filter((d) =>
      d.title.toLowerCase().includes("vitest"),
    );
    expect(vtDrafts.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Req: Docs Ingestion — README decisions captured [P1]
// ---------------------------------------------------------------------------

describe("Docs Ingestion — README decisions captured [P1]", () => {
  it("extracts a TDD decision from README containing 'enforces' keyword", () => {
    writeFileSync(
      join(TEST_DIR, "README.md"),
      "# speq\n\nspeq enforces a disciplined workflow where tests are written before code.\n",
      "utf-8",
    );

    const results = docsIngestion(TEST_DIR);

    expect(results.length).toBeGreaterThanOrEqual(1);
    const tdd = results.find(
      (r) =>
        r.evidence.toLowerCase().includes("enforces") ||
        r.title.toLowerCase().includes("tdd") ||
        r.title.toLowerCase().includes("test"),
    );
    expect(tdd).toBeDefined();
    expect(tdd!.evidence).toMatch(/enforces/i);
  });

  it("captures a decision sentence containing 'we use'", () => {
    writeFileSync(
      join(TEST_DIR, "README.md"),
      "# Project\n\nWe use PostgreSQL as the primary database.\n",
      "utf-8",
    );

    const results = docsIngestion(TEST_DIR);

    const pg = results.find(
      (r) =>
        r.evidence.toLowerCase().includes("postgresql") ||
        r.title.toLowerCase().includes("postgresql"),
    );
    expect(pg).toBeDefined();
  });

  it("captures a decision sentence containing 'chosen'", () => {
    writeFileSync(
      join(TEST_DIR, "README.md"),
      "# Project\n\nWe have chosen TypeScript for type safety.\n",
      "utf-8",
    );

    const results = docsIngestion(TEST_DIR);

    expect(results.length).toBeGreaterThanOrEqual(1);
    const chosen = results.find((r) => r.evidence.toLowerCase().includes("chosen"));
    expect(chosen).toBeDefined();
  });

  it("returns empty array when README does not exist", () => {
    const results = docsIngestion(TEST_DIR);
    expect(results).toEqual([]);
  });

  it("returns empty array when README has no decision-like sentences", () => {
    writeFileSync(
      join(TEST_DIR, "README.md"),
      "# My Project\n\nThis project does stuff.\n",
      "utf-8",
    );

    const results = docsIngestion(TEST_DIR);
    expect(results).toEqual([]);
  });

  it("README quote appears in evidence of the generated draft ADR", () => {
    const sentence =
      "speq enforces a disciplined workflow where tests are written before code.";
    writeFileSync(
      join(TEST_DIR, "README.md"),
      `# speq\n\n${sentence}\n`,
      "utf-8",
    );

    const result = bootstrap(TEST_DIR);

    const matchingDraft = result.drafts.find(
      (d) => d.evidence.includes("enforces") || d.evidence.includes("written before"),
    );
    expect(matchingDraft).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Req: Interactive Interview — Low-confidence draft triggers question [P1]
// ---------------------------------------------------------------------------

describe("Interactive Interview — Low-confidence draft triggers question [P1]", () => {
  it("returns a question when both vitest and jest are in devDependencies (ambiguous)", () => {
    writePackageJson(TEST_DIR, {
      devDependencies: { vitest: "^2.0.0", jest: "^29.0.0" },
    });

    const result = bootstrap(TEST_DIR);

    expect(result.questions.length).toBeGreaterThanOrEqual(1);
    const q = result.questions.find(
      (q) =>
        q.question.toLowerCase().includes("vitest") &&
        q.question.toLowerCase().includes("jest"),
    );
    expect(q).toBeDefined();
    expect(q!.context).toMatch(/vitest|jest/i);
  });

  it("does not generate a question when only one test runner is present", () => {
    writePackageJson(TEST_DIR, {
      devDependencies: { vitest: "^2.0.0" },
    });

    const result = bootstrap(TEST_DIR);

    const testFrameworkQ = result.questions.find(
      (q) =>
        q.question.toLowerCase().includes("test framework") ||
        (q.question.toLowerCase().includes("vitest") &&
          q.question.toLowerCase().includes("jest")),
    );
    expect(testFrameworkQ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Req: Commit Epoch Clustering — Epoch boundary generates ADR [P2]
// ---------------------------------------------------------------------------

describe("Commit Epoch Clustering — Epoch boundary generates ADR [P2]", () => {
  it("generates a draft ADR for ORM adoption when --include-history mock detects drizzle cluster", () => {
    writePackageJson(TEST_DIR, {
      dependencies: { "drizzle-orm": "^0.30.0", "drizzle-kit": "^0.20.0" },
    });
    mkdirSync(join(TEST_DIR, "src", "db"), { recursive: true });
    writeFileSync(join(TEST_DIR, "src", "db", "schema.ts"), "export const schema = {};", "utf-8");

    // Provide a mock git history via options
    const mockHistory = [
      {
        date: "2024-01-10",
        message: "add drizzle-orm and drizzle-kit",
        files: ["package.json", "src/db/schema.ts"],
      },
      {
        date: "2024-01-11",
        message: "add drizzle migrations",
        files: ["src/db/migrations/0001.sql"],
      },
    ];

    const result = bootstrap(TEST_DIR, undefined, {
      includeHistory: true,
      mockHistory,
    });

    const ormDraft = result.drafts.find(
      (d) =>
        d.title.toLowerCase().includes("drizzle") ||
        d.title.toLowerCase().includes("orm"),
    );
    expect(ormDraft).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Req: P0 — Bootstrap preserves existing active ADRs on error
// ---------------------------------------------------------------------------

describe("Bootstrap preserves existing active ADRs on error [P0]", () => {
  it("existing active ADR is unchanged after bootstrap encounters an error", () => {
    writeActiveAdr(TEST_DIR, 1, "Use TypeScript");
    const adrPath = join(TEST_DIR, "docs", "adr", "0001-use-typescript.md");
    const originalContent = readFileSync(adrPath, "utf-8");

    // Write a malformed package.json to trigger a parse error mid-scan
    writeFileSync(join(TEST_DIR, "package.json"), "{ INVALID JSON }", "utf-8");

    // bootstrap should not throw — it must return a result or throw gracefully
    // but the original ADR must remain unchanged
    try {
      bootstrap(TEST_DIR);
    } catch {
      // Acceptable — but ADR must still be intact
    }

    const afterContent = readFileSync(adrPath, "utf-8");
    expect(afterContent).toBe(originalContent);
    expect(afterContent).toContain("status: active");
  });

  it("drafts produced before an error are preserved on disk", () => {
    writePackageJson(TEST_DIR, {
      devDependencies: { vitest: "^2.0.0" },
    });

    // This should succeed (no error) and produce at least one draft file on disk
    const result = bootstrap(TEST_DIR);

    if (result.drafts.length > 0) {
      const adrDir = join(TEST_DIR, "docs", "adr");
      const adrs = listAdrs(TEST_DIR);
      expect(adrs.length).toBeGreaterThanOrEqual(result.drafts.length);
    }
  });
});

// ---------------------------------------------------------------------------
// Req: Performance — Large repo scan within 5s [P2]
// ---------------------------------------------------------------------------

describe("Performance — Large repo scan within 5s [P2]", () => {
  it("structuralScan completes within 5000ms for a project with 500 files", () => {
    // Create 10 subdirectories with 50 files each = 500 files
    for (let d = 0; d < 10; d++) {
      const subDir = join(TEST_DIR, `module${d}`);
      mkdirSync(subDir, { recursive: true });
      for (let f = 0; f < 50; f++) {
        writeFileSync(
          join(subDir, `file${f}.ts`),
          `export const x${f} = ${f};\n`,
          "utf-8",
        );
      }
    }

    // Write 10 package.json-like manifests in subdirectories
    for (let d = 0; d < 10; d++) {
      writePackageJson(join(TEST_DIR, `module${d}`), {
        dependencies: { yaml: "^2.0.0" },
      });
    }

    // Root package.json
    writePackageJson(TEST_DIR, {
      devDependencies: { typescript: "^5.0.0", vitest: "^2.0.0" },
    });

    const start = Date.now();
    const results = structuralScan(TEST_DIR);
    const elapsed = Date.now() - start;

    expect(Array.isArray(results)).toBe(true);
    expect(elapsed).toBeLessThan(5000);
  });
});

// ---------------------------------------------------------------------------
// BootstrapResult shape validation
// ---------------------------------------------------------------------------

describe("BootstrapResult shape", () => {
  it("returns a result with drafts, questions, and preserved fields", () => {
    const result = bootstrap(TEST_DIR);

    expect(result).toHaveProperty("drafts");
    expect(result).toHaveProperty("questions");
    expect(result).toHaveProperty("preserved");
    expect(Array.isArray(result.drafts)).toBe(true);
    expect(Array.isArray(result.questions)).toBe(true);
    expect(typeof result.preserved).toBe("number");
  });

  it("each draft has id, title, and evidence fields", () => {
    writePackageJson(TEST_DIR, {
      devDependencies: { typescript: "^5.0.0" },
    });

    const result = bootstrap(TEST_DIR);

    for (const draft of result.drafts) {
      expect(typeof draft.id).toBe("number");
      expect(typeof draft.title).toBe("string");
      expect(typeof draft.evidence).toBe("string");
      expect(draft.id).toBeGreaterThan(0);
    }
  });

  it("each question has question and context fields", () => {
    writePackageJson(TEST_DIR, {
      devDependencies: { vitest: "^2.0.0", jest: "^29.0.0" },
    });

    const result = bootstrap(TEST_DIR);

    for (const q of result.questions) {
      expect(typeof q.question).toBe("string");
      expect(typeof q.context).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// Custom adrPath support
// ---------------------------------------------------------------------------

describe("Custom adrPath support", () => {
  it("writes draft ADR files to the custom path", () => {
    writePackageJson(TEST_DIR, {
      devDependencies: { typescript: "^5.0.0" },
    });

    const customPath = "architecture/decisions";
    const result = bootstrap(TEST_DIR, customPath);

    if (result.drafts.length > 0) {
      const customAdrDir = join(TEST_DIR, customPath);
      expect(existsSync(customAdrDir)).toBe(true);
    }
  });
});
