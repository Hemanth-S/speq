import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  mkdtempSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { addAdr } from "../src/adr.js";
import {
  surfaceRelevantAdrs,
  checkPrdViolations,
  runAdrVerifyGate,
} from "../src/adr-enforcement.js";
import type { AdrCheckResult } from "../src/adr-enforcement.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let TEST_DIR: string;

beforeEach(() => {
  TEST_DIR = mkdtempSync(join(tmpdir(), "speq-adr-enf-test-"));
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

/**
 * Write a fully-formed ADR file with controlled content.
 * Uses addAdr() to create the skeleton, then patches it to set status, tags,
 * and decision text — exactly as the spec directs.
 */
function makeAdr(opts: {
  title: string;
  status: "draft" | "active" | "superseded";
  tags?: string[];
  decisionText?: string;
  adrPath?: string;
}): { id: number; path: string } {
  const result = addAdr(TEST_DIR, opts.title, opts.adrPath);
  let content = readFileSync(result.path, "utf-8");

  // Patch status
  content = content.replace(
    /^status:\s*(draft|active|superseded)$/m,
    `status: ${opts.status}`,
  );

  // Patch tags
  const tagsValue = opts.tags && opts.tags.length > 0
    ? `[${opts.tags.join(", ")}]`
    : "[]";
  content = content.replace(/^tags:\s*\[.*\]$/m, `tags: ${tagsValue}`);

  // Patch Decision section
  if (opts.decisionText) {
    content = content.replace(
      /## Decision\n\[To be filled\]/,
      `## Decision\n${opts.decisionText}`,
    );
  }

  writeFileSync(result.path, content, "utf-8");
  return result;
}

// ---------------------------------------------------------------------------
// Req: ADR Surfacing in Requirements
// ---------------------------------------------------------------------------

describe("ADR Surfacing in Requirements", () => {
  describe("Active ADR surfaced during /requirements [P1]", () => {
    it("returns an active ADR whose tags match context keywords", () => {
      makeAdr({
        title: "No Redis",
        status: "active",
        tags: ["caching", "infrastructure"],
        decisionText: "We will not use Redis for any caching layer.",
      });

      const results = surfaceRelevantAdrs(TEST_DIR, "caching layer");

      expect(results.length).toBeGreaterThanOrEqual(1);
      const adr = results.find((a) => a.title === "No Redis");
      expect(adr).toBeDefined();
      expect(adr!.status).toBe("active");
    });

    it("surfaces ADR when context matches tag exactly", () => {
      makeAdr({
        title: "No Redis",
        status: "active",
        tags: ["caching", "infrastructure"],
        decisionText: "We will not use Redis.",
      });

      const results = surfaceRelevantAdrs(TEST_DIR, "infrastructure upgrade");

      const adr = results.find((a) => a.title === "No Redis");
      expect(adr).toBeDefined();
    });

    it("does not surface ADR when no tags match context", () => {
      makeAdr({
        title: "Use Postgres",
        status: "active",
        tags: ["database", "storage"],
        decisionText: "We will use Postgres.",
      });

      const results = surfaceRelevantAdrs(TEST_DIR, "logging system");

      const adr = results.find((a) => a.title === "Use Postgres");
      expect(adr).toBeUndefined();
    });
  });

  describe("Superseded ADR not surfaced [P2]", () => {
    it("excludes superseded ADRs from surfacing results", () => {
      makeAdr({
        title: "Use Express",
        status: "superseded",
        tags: ["framework", "http"],
        decisionText: "We will use Express for HTTP.",
      });

      const results = surfaceRelevantAdrs(TEST_DIR, "http framework");

      const adr = results.find((a) => a.title === "Use Express");
      expect(adr).toBeUndefined();
    });

    it("excludes draft ADRs from surfacing results", () => {
      makeAdr({
        title: "Evaluate Fastify",
        status: "draft",
        tags: ["framework", "http"],
        decisionText: "We may use Fastify.",
      });

      const results = surfaceRelevantAdrs(TEST_DIR, "http framework evaluation");

      const adr = results.find((a) => a.title === "Evaluate Fastify");
      expect(adr).toBeUndefined();
    });

    it("surfaces active ADR while ignoring superseded sibling with same tags", () => {
      makeAdr({
        title: "Use Express",
        status: "superseded",
        tags: ["framework"],
        decisionText: "We will use Express.",
      });
      makeAdr({
        title: "Use Fastify",
        status: "active",
        tags: ["framework"],
        decisionText: "We will use Fastify instead of Express.",
      });

      const results = surfaceRelevantAdrs(TEST_DIR, "framework choice");

      const superseded = results.find((a) => a.title === "Use Express");
      const active = results.find((a) => a.title === "Use Fastify");
      expect(superseded).toBeUndefined();
      expect(active).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Req: ADR Violation Detection in Enrich
// ---------------------------------------------------------------------------

describe("ADR Violation Detection in Enrich", () => {
  describe("Violation flagged in /enrich [P1]", () => {
    it("flags PRD that introduces a technology prohibited in an active ADR", () => {
      makeAdr({
        title: "No Redis",
        status: "active",
        tags: ["caching"],
        decisionText: "We will not use Redis for any caching. Redis is prohibited.",
      });

      const result = checkPrdViolations(
        TEST_DIR,
        "Add Redis caching for session data",
      );

      expect(result.violations.length).toBeGreaterThanOrEqual(1);
      const v = result.violations.find((v) => v.adr_id === 1);
      expect(v).toBeDefined();
      expect(v!.title).toBe("No Redis");
      expect(v!.detail).toMatch(/redis/i);
    });

    it("returns an empty violations array when PRD text does not contradict active ADRs", () => {
      makeAdr({
        title: "No Redis",
        status: "active",
        tags: ["caching"],
        decisionText: "We will not use Redis for any caching.",
      });

      const result = checkPrdViolations(
        TEST_DIR,
        "Add Memcached for session data",
      );

      expect(result.violations).toHaveLength(0);
    });

    it("does not flag violation against superseded ADR", () => {
      makeAdr({
        title: "No Redis",
        status: "superseded",
        tags: ["caching"],
        decisionText: "We will not use Redis. Redis is prohibited.",
      });

      const result = checkPrdViolations(
        TEST_DIR,
        "Add Redis caching for session data",
      );

      expect(result.violations).toHaveLength(0);
    });
  });

  describe("ADR violation cannot be silently bypassed [P0]", () => {
    it("sets blocking: true when at least one violation is found", () => {
      makeAdr({
        title: "No Redis",
        status: "active",
        tags: ["caching"],
        decisionText: "We will not use Redis. Redis is prohibited.",
      });

      const result = checkPrdViolations(
        TEST_DIR,
        "Use Redis for caching sessions",
      );

      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.blocking).toBe(true);
    });

    it("sets blocking: false when no violations are found", () => {
      makeAdr({
        title: "No Redis",
        status: "active",
        tags: ["caching"],
        decisionText: "We will not use Redis. Redis is prohibited.",
      });

      const result = checkPrdViolations(
        TEST_DIR,
        "Use PostgreSQL for persistent storage",
      );

      expect(result.violations).toHaveLength(0);
      expect(result.blocking).toBe(false);
    });

    it("reports multiple violations when multiple ADRs are breached", () => {
      makeAdr({
        title: "No Redis",
        status: "active",
        tags: ["caching"],
        decisionText: "We will not use Redis. Redis is prohibited.",
      });
      makeAdr({
        title: "No MongoDB",
        status: "active",
        tags: ["database"],
        decisionText: "We will not use MongoDB. MongoDB is prohibited.",
      });

      const result = checkPrdViolations(
        TEST_DIR,
        "Use Redis for caching and MongoDB for storage",
      );

      expect(result.violations.length).toBe(2);
      expect(result.blocking).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Req: ADR Compliance in Verify
// ---------------------------------------------------------------------------

describe("ADR Compliance in Verify", () => {
  describe("Verify gate passes when no violations [P1]", () => {
    it("returns pass status with correct adrs_checked count", () => {
      makeAdr({
        title: "No Redis",
        status: "active",
        tags: ["caching"],
        decisionText: "We will not use Redis.",
      });
      makeAdr({
        title: "Use TypeScript",
        status: "active",
        tags: ["language"],
        decisionText: "We will use TypeScript for all source files.",
      });

      const changedFiles = [
        { path: "src/cache.ts", content: "export function cache() { return null; }" },
        { path: "package.json", content: '{"dependencies":{"yaml":"^2.0.0"}}' },
      ];

      const result = runAdrVerifyGate(TEST_DIR, changedFiles);

      expect(result.gate).toBe("adr-compliance");
      expect(result.status).toBe("pass");
      expect(result.adrs_checked).toBe(2);
      expect(result.violations).toHaveLength(0);
    });

    it("passes with zero ADRs (no constraints to violate)", () => {
      const result = runAdrVerifyGate(TEST_DIR, [
        { path: "src/index.ts", content: "export const x = 1;" },
      ]);

      expect(result.status).toBe("pass");
      expect(result.adrs_checked).toBe(0);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe("Verify gate fails with citation [P1]", () => {
    it("fails when diff adds redis to package.json deps and ADR-0007 prohibits it", () => {
      // Create 6 placeholder ADRs to push the no-redis ADR to id 7
      for (let i = 1; i <= 6; i++) {
        makeAdr({
          title: `Decision ${i}`,
          status: "active",
          tags: [`tag${i}`],
          decisionText: `We decided thing ${i}.`,
        });
      }
      makeAdr({
        title: "No Redis",
        status: "active",
        tags: ["caching"],
        decisionText: "We will not use Redis in this project. Redis is prohibited.",
      });

      const changedFiles = [
        {
          path: "package.json",
          content: '{"dependencies":{"redis":"^4.0.0","yaml":"^2.0.0"}}',
        },
      ];

      const result = runAdrVerifyGate(TEST_DIR, changedFiles);

      expect(result.status).toBe("fail");
      expect(result.violations.length).toBeGreaterThanOrEqual(1);
      const v = result.violations.find((v) => v.adr_id === 7);
      expect(v).toBeDefined();
      expect(v!.title).toBe("No Redis");
      expect(v!.detail).toMatch(/redis/i);
      expect(v!.detail).toMatch(/package\.json/i);
    });

    it("includes the filename in the violation detail", () => {
      makeAdr({
        title: "No Redis",
        status: "active",
        tags: ["caching"],
        decisionText: "We will not use Redis. Redis is prohibited.",
      });

      const changedFiles = [
        {
          path: "src/session.ts",
          content: 'import redis from "redis";',
        },
      ];

      const result = runAdrVerifyGate(TEST_DIR, changedFiles);

      expect(result.status).toBe("fail");
      const v = result.violations[0];
      expect(v.detail).toMatch(/src\/session\.ts/i);
    });

    it("does not fail on diff that contradicts only superseded ADRs", () => {
      makeAdr({
        title: "No Redis",
        status: "superseded",
        tags: ["caching"],
        decisionText: "We will not use Redis. Redis is prohibited.",
      });

      const changedFiles = [
        {
          path: "package.json",
          content: '{"dependencies":{"redis":"^4.0.0"}}',
        },
      ];

      const result = runAdrVerifyGate(TEST_DIR, changedFiles);

      expect(result.status).toBe("pass");
      expect(result.violations).toHaveLength(0);
    });
  });

  describe("Idempotent gate evaluation [P1]", () => {
    it("produces identical results on two consecutive runs with same inputs", () => {
      makeAdr({
        title: "No Redis",
        status: "active",
        tags: ["caching"],
        decisionText: "We will not use Redis. Redis is prohibited.",
      });

      const changedFiles = [
        { path: "package.json", content: '{"dependencies":{"redis":"^4.0.0"}}' },
      ];

      const result1 = runAdrVerifyGate(TEST_DIR, changedFiles);
      const result2 = runAdrVerifyGate(TEST_DIR, changedFiles);

      expect(result1).toEqual(result2);
    });

    it("produces identical pass results on two consecutive runs when no violations", () => {
      makeAdr({
        title: "Use TypeScript",
        status: "active",
        tags: ["language"],
        decisionText: "We will use TypeScript.",
      });

      const changedFiles = [
        { path: "src/index.ts", content: "export const x = 1;" },
      ];

      const result1 = runAdrVerifyGate(TEST_DIR, changedFiles);
      const result2 = runAdrVerifyGate(TEST_DIR, changedFiles);

      expect(result1).toEqual(result2);
      expect(result1.status).toBe("pass");
    });
  });
});

// ---------------------------------------------------------------------------
// Req: Performance
// ---------------------------------------------------------------------------

describe("Performance", () => {
  describe("ADR scan under 2s for 50 ADRs [P1]", () => {
    it("completes runAdrVerifyGate in under 2000ms with 50 active ADRs", () => {
      // Create 50 active ADRs
      for (let i = 1; i <= 50; i++) {
        makeAdr({
          title: `Decision ${i} about system design`,
          status: "active",
          tags: [`tag${i}`, "architecture"],
          decisionText: `We decided to use approach ${i} for subsystem ${i}. This is final.`,
        });
      }

      const changedFiles = [
        { path: "src/main.ts", content: "export function main() {}" },
        { path: "package.json", content: '{"dependencies":{"yaml":"^2.0.0"}}' },
      ];

      const start = Date.now();
      const result = runAdrVerifyGate(TEST_DIR, changedFiles);
      const elapsed = Date.now() - start;

      expect(result.adrs_checked).toBe(50);
      expect(elapsed).toBeLessThan(2000);
    });
  });
});
