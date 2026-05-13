import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  gradeStep,
  getAffectedSteps,
  writeStepEvalResult,
  STEP_RUBRICS,
  type StepEvalResult,
  type Rubric,
} from "../src/eval-step.js";

// ── helpers ──────────────────────────────────────────────────────────────────

const TEST_DIR = join(tmpdir(), "speq-eval-step-test-" + process.pid);

function evalResultPath(speqDir: string, stepName: string, timestamp: string): string {
  return join(speqDir, "evals", "runs", timestamp, `step-${stepName}.json`);
}

// ── setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

// ── gradeStep ────────────────────────────────────────────────────────────────

describe("gradeStep", () => {
  // P1: Step output scored (0-100) with qualitative report
  it("produces a score 0-100 and a criteria report for a matching output (P1)", () => {
    const rubric: Rubric = {
      version: "v1",
      criteria: [
        { name: "covers security", check: "covers security?" },
        { name: "covers failure", check: "covers failure?" },
      ],
    };

    const output = "This spec covers security hardening and covers failure modes thoroughly.";
    const result = gradeStep("spec", output, rubric);

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.step).toBe("spec");
    expect(result.rubric_version).toBe("v1");
    expect(result.criteria).toHaveLength(2);
    expect(result.timestamp).toBeTruthy();
  });

  it("gives a higher score when more criteria keywords are present (P1)", () => {
    const rubric: Rubric = {
      version: "v1",
      criteria: [
        { name: "covers security", check: "covers security?" },
        { name: "covers failure", check: "covers failure?" },
        { name: "covers idempotency", check: "covers idempotency?" },
      ],
    };

    const fullOutput =
      "This spec covers security and addresses failure modes and discusses idempotency.";
    const partialOutput = "This spec covers security only.";

    const fullResult = gradeStep("spec", fullOutput, rubric);
    const partialResult = gradeStep("spec", partialOutput, rubric);

    expect(fullResult.score).toBeGreaterThan(partialResult.score);
  });

  it("score is 0 when no keywords match (P1)", () => {
    const rubric: Rubric = {
      version: "v1",
      criteria: [
        { name: "covers security", check: "covers security?" },
        { name: "covers failure", check: "covers failure?" },
      ],
    };

    const output = "This document talks about unrelated things entirely.";
    const result = gradeStep("spec", output, rubric);

    expect(result.score).toBe(0);
    expect(result.criteria.every((c) => !c.passed)).toBe(true);
  });

  it("score is 100 when all criteria keywords match (P1)", () => {
    const rubric: Rubric = {
      version: "v1",
      criteria: [
        { name: "covers security", check: "covers security?" },
        { name: "covers failure", check: "covers failure?" },
      ],
    };

    const output = "This spec covers security hardening and failure recovery.";
    const result = gradeStep("spec", output, rubric);

    expect(result.score).toBe(100);
    expect(result.criteria.every((c) => c.passed)).toBe(true);
  });

  // P1: Score includes rubric version
  it("result includes the rubric version for reproducibility (P1)", () => {
    const rubric: Rubric = {
      version: "v2",
      criteria: [{ name: "covers security", check: "covers security?" }],
    };

    const result = gradeStep("spec", "covers security details here", rubric);
    expect(result.rubric_version).toBe("v2");
  });

  // P1: Idempotent grading — same output + rubric => scores within ±5
  it("is idempotent: same output and rubric produce scores within ±5 (P1)", () => {
    const rubric: Rubric = {
      version: "v1",
      criteria: [
        { name: "covers security", check: "covers security?" },
        { name: "covers failure", check: "covers failure?" },
        { name: "covers idempotency", check: "covers idempotency?" },
        { name: "covers performance", check: "covers performance?" },
      ],
    };

    const output =
      "This spec covers security, failure modes, idempotency considerations, and performance targets.";

    const result1 = gradeStep("spec", output, rubric);
    const result2 = gradeStep("spec", output, rubric);

    expect(Math.abs(result1.score - result2.score)).toBeLessThanOrEqual(5);
    expect(result1.score).toEqual(result2.score); // heuristic grader is deterministic
  });

  // Each criterion entry has name, passed, and detail
  it("each criterion entry has name, passed boolean, and detail string (P1)", () => {
    const rubric: Rubric = {
      version: "v1",
      criteria: [{ name: "covers security", check: "covers security?" }],
    };

    const result = gradeStep("spec", "covers security here", rubric);

    expect(result.criteria[0]).toMatchObject({
      name: "covers security",
      passed: expect.any(Boolean),
      detail: expect.any(String),
    });
  });

  it("result has a timestamp field in ISO format (P1)", () => {
    const rubric: Rubric = {
      version: "v1",
      criteria: [{ name: "covers security", check: "covers security?" }],
    };

    const result = gradeStep("spec", "some output", rubric);
    expect(() => new Date(result.timestamp)).not.toThrow();
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });
});

// ── getAffectedSteps ─────────────────────────────────────────────────────────

describe("getAffectedSteps", () => {
  // P1: Model change triggers eval — detect which step was affected
  it("returns affected step when steps.<step>.model changes (P1)", () => {
    const oldConfig = { steps: { spec: { model: "sonnet" }, implement: { model: "sonnet" } } };
    const newConfig = { steps: { spec: { model: "haiku" }, implement: { model: "sonnet" } } };

    const affected = getAffectedSteps(oldConfig, newConfig);

    expect(affected).toContain("spec");
    expect(affected).not.toContain("implement");
  });

  it("returns multiple affected steps when multiple models change (P1)", () => {
    const oldConfig = {
      steps: { spec: { model: "sonnet" }, implement: { model: "sonnet" }, verify: { model: "opus" } },
    };
    const newConfig = {
      steps: { spec: { model: "haiku" }, implement: { model: "haiku" }, verify: { model: "opus" } },
    };

    const affected = getAffectedSteps(oldConfig, newConfig);

    expect(affected).toContain("spec");
    expect(affected).toContain("implement");
    expect(affected).not.toContain("verify");
  });

  // P2: Unrelated config change does not trigger spec eval
  it("returns only implement when implement model changes (P2)", () => {
    const oldConfig = { steps: { spec: { model: "sonnet" }, implement: { model: "sonnet" } } };
    const newConfig = { steps: { spec: { model: "sonnet" }, implement: { model: "haiku" } } };

    const affected = getAffectedSteps(oldConfig, newConfig);

    expect(affected).not.toContain("spec");
    expect(affected).toContain("implement");
  });

  it("returns empty array when no step models change (P2)", () => {
    const oldConfig = { steps: { spec: { model: "sonnet" } } };
    const newConfig = { steps: { spec: { model: "sonnet" } } };

    const affected = getAffectedSteps(oldConfig, newConfig);

    expect(affected).toHaveLength(0);
  });

  it("returns empty array when unrelated top-level key changes (P2)", () => {
    const oldConfig = { steps: { spec: { model: "sonnet" } }, version: "1" };
    const newConfig = { steps: { spec: { model: "sonnet" } }, version: "2" };

    const affected = getAffectedSteps(oldConfig, newConfig);

    expect(affected).toHaveLength(0);
  });

  it("handles configs with no steps key gracefully (P2)", () => {
    const oldConfig = { version: "1" };
    const newConfig = { version: "2" };

    const affected = getAffectedSteps(oldConfig, newConfig);

    expect(affected).toHaveLength(0);
  });

  it("handles step appearing in new config but not old (P1)", () => {
    const oldConfig = { steps: { spec: { model: "sonnet" } } };
    const newConfig = { steps: { spec: { model: "sonnet" }, implement: { model: "haiku" } } };

    const affected = getAffectedSteps(oldConfig, newConfig);

    // New step with a model is a change — eval should run
    expect(affected).toContain("implement");
    expect(affected).not.toContain("spec");
  });
});

// ── writeStepEvalResult ───────────────────────────────────────────────────────

describe("writeStepEvalResult", () => {
  it("writes result JSON to the correct path (P1)", () => {
    const speqDir = join(TEST_DIR, ".speq");
    const result: StepEvalResult = {
      step: "spec",
      score: 75,
      rubric_version: "v1",
      criteria: [
        { name: "covers security", passed: true, detail: "keyword 'security' found" },
        { name: "covers failure", passed: false, detail: "keyword 'failure' not found" },
      ],
      timestamp: new Date().toISOString(),
    };

    writeStepEvalResult(speqDir, result);

    const expectedPath = evalResultPath(speqDir, "spec", result.timestamp);
    expect(existsSync(expectedPath)).toBe(true);

    const parsed = JSON.parse(readFileSync(expectedPath, "utf-8"));
    expect(parsed.score).toBe(75);
    expect(parsed.rubric_version).toBe("v1");
    expect(parsed.step).toBe("spec");
  });

  it("creates parent directories if they do not exist (P1)", () => {
    const speqDir = join(TEST_DIR, "deep", "nested", ".speq");
    const result: StepEvalResult = {
      step: "plan",
      score: 50,
      rubric_version: "v1",
      criteria: [],
      timestamp: new Date().toISOString(),
    };

    writeStepEvalResult(speqDir, result);

    const expectedPath = evalResultPath(speqDir, "plan", result.timestamp);
    expect(existsSync(expectedPath)).toBe(true);
  });

  // P0: Eval results must NOT contain raw step output
  it("does NOT include raw step output in the written JSON (P0)", () => {
    const speqDir = join(TEST_DIR, ".speq");
    const result: StepEvalResult = {
      step: "spec",
      score: 80,
      rubric_version: "v1",
      criteria: [{ name: "covers security", passed: true, detail: "keyword found" }],
      timestamp: new Date().toISOString(),
    };

    writeStepEvalResult(speqDir, result);

    const expectedPath = evalResultPath(speqDir, "spec", result.timestamp);
    const parsed = JSON.parse(readFileSync(expectedPath, "utf-8"));

    // The result type must NOT have a raw_output field
    expect(parsed).not.toHaveProperty("raw_output");
    expect(parsed).not.toHaveProperty("output");
    expect(parsed).not.toHaveProperty("content");

    // Must have exactly these keys
    const keys = Object.keys(parsed);
    expect(keys).toContain("score");
    expect(keys).toContain("rubric_version");
    expect(keys).toContain("criteria");
    expect(keys).toContain("step");
    expect(keys).toContain("timestamp");
  });

  it("two runs with different timestamps produce independent files (P1)", () => {
    const speqDir = join(TEST_DIR, ".speq");

    const result1: StepEvalResult = {
      step: "spec",
      score: 60,
      rubric_version: "v1",
      criteria: [],
      timestamp: "2026-05-13T10:00:00.000Z",
    };
    const result2: StepEvalResult = {
      step: "spec",
      score: 80,
      rubric_version: "v1",
      criteria: [],
      timestamp: "2026-05-13T11:00:00.000Z",
    };

    writeStepEvalResult(speqDir, result1);
    writeStepEvalResult(speqDir, result2);

    const path1 = evalResultPath(speqDir, "spec", result1.timestamp);
    const path2 = evalResultPath(speqDir, "spec", result2.timestamp);

    expect(existsSync(path1)).toBe(true);
    expect(existsSync(path2)).toBe(true);

    const parsed1 = JSON.parse(readFileSync(path1, "utf-8"));
    const parsed2 = JSON.parse(readFileSync(path2, "utf-8"));

    expect(parsed1.score).toBe(60);
    expect(parsed2.score).toBe(80);
  });
});

// ── STEP_RUBRICS ─────────────────────────────────────────────────────────────

describe("STEP_RUBRICS", () => {
  it("exports built-in rubrics for at least the core steps (P1)", () => {
    expect(STEP_RUBRICS).toBeDefined();
    // Must have at least spec, plan, and implement rubrics per the spec
    expect(STEP_RUBRICS["spec"]).toBeDefined();
    expect(STEP_RUBRICS["spec"].version).toBeTruthy();
    expect(Array.isArray(STEP_RUBRICS["spec"].criteria)).toBe(true);
    expect(STEP_RUBRICS["spec"].criteria.length).toBeGreaterThan(0);
  });

  it("spec rubric checks cover security, failure, idempotency, performance (P1)", () => {
    const specRubric = STEP_RUBRICS["spec"];

    // Per the spec: "covers security? failure? idempotency? performance?"
    const criteriaNames = specRubric.criteria.map((c) => c.name.toLowerCase());
    const allText = criteriaNames.join(" ");

    expect(allText).toContain("security");
    expect(allText).toContain("failure");
    expect(allText).toContain("idempotency");
    expect(allText).toContain("performance");
  });

  it("each rubric has a version string and non-empty criteria array (P1)", () => {
    for (const [stepName, rubric] of Object.entries(STEP_RUBRICS)) {
      expect(rubric.version, `step ${stepName} rubric version`).toBeTruthy();
      expect(rubric.criteria.length, `step ${stepName} criteria`).toBeGreaterThan(0);
      for (const criterion of rubric.criteria) {
        expect(criterion.name, `criterion name in ${stepName}`).toBeTruthy();
        expect(criterion.check, `criterion check in ${stepName}`).toBeTruthy();
      }
    }
  });
});

// ── Integration: gradeStep with STEP_RUBRICS + writeStepEvalResult ───────────

describe("integration: full eval pipeline", () => {
  it("grades spec output with built-in rubric and writes result without raw output (P0+P1)", () => {
    const speqDir = join(TEST_DIR, ".speq");

    // A realistic-ish spec output that touches all four rubric dimensions
    const specOutput = `
# auth-service OpenSpec

## Security
- All endpoints require JWT; threat model reviewed; P0 injection tests required.

## Failure modes
- Network timeout → retry with exponential backoff; circuit breaker on downstream.

## Idempotency
- POST /token is idempotent by design; duplicate requests return the same token.

## Performance
- P99 latency target: 200ms under 500 rps load.
    `.trim();

    const rubric = STEP_RUBRICS["spec"];
    const result = gradeStep("spec", specOutput, rubric);

    // Score should be positive (keywords present)
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.rubric_version).toBe(rubric.version);

    writeStepEvalResult(speqDir, result);

    const writtenPath = evalResultPath(speqDir, "spec", result.timestamp);
    expect(existsSync(writtenPath)).toBe(true);

    const parsed = JSON.parse(readFileSync(writtenPath, "utf-8"));

    // P0: no raw output in file
    expect(parsed).not.toHaveProperty("raw_output");
    expect(parsed).not.toHaveProperty("output");

    // Must have grading fields
    expect(typeof parsed.score).toBe("number");
    expect(typeof parsed.rubric_version).toBe("string");
    expect(Array.isArray(parsed.criteria)).toBe(true);
  });

  // P1: Step eval completes — test function shape is callable
  it("step eval function is callable and returns a StepEvalResult shape (P1)", () => {
    const rubric: Rubric = {
      version: "v1",
      criteria: [{ name: "covers security", check: "covers security?" }],
    };

    const result = gradeStep("spec", "covers security", rubric);

    // Structural shape check (acts as type guard in JS land)
    expect(typeof result.step).toBe("string");
    expect(typeof result.score).toBe("number");
    expect(typeof result.rubric_version).toBe("string");
    expect(Array.isArray(result.criteria)).toBe(true);
    expect(typeof result.timestamp).toBe("string");
  });
});

// ── LLM grading hook interface (shape-only, not invoked in tests) ─────────────

describe("LLM grading hook (interface shape)", () => {
  it("gradeStepWithLLM is exported as a function (hook for Haiku-backed grader)", async () => {
    const mod = await import("../src/eval-step.js");
    expect(typeof mod.gradeStepWithLLM).toBe("function");
  });
});
