import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CriterionResult {
  name: string;
  passed: boolean;
  detail: string;
}

export interface StepEvalResult {
  step: string;
  score: number; // 0-100
  rubric_version: string;
  criteria: CriterionResult[];
  timestamp: string;
}

export interface RubricCriterion {
  /** Human-readable name, e.g. "covers security" */
  name: string;
  /** Question/probe used to evaluate, e.g. "covers security?" */
  check: string;
}

export interface Rubric {
  version: string;
  criteria: RubricCriterion[];
}

// ── Keyword maps for heuristic grading ───────────────────────────────────────

/**
 * Maps the keyword stem from a criterion name to the set of tokens that count
 * as evidence of coverage.  Matching is case-insensitive against the output.
 */
const CRITERION_KEYWORDS: Record<string, string[]> = {
  security: ["security", "p0", "threat", "injection", "auth", "jwt", "hardening"],
  failure: ["failure", "fail", "retry", "circuit", "timeout", "fallback", "backoff"],
  idempotency: ["idempotent", "idempotency", "duplicate", "replay"],
  performance: ["performance", "latency", "p99", "rps", "throughput", "load"],
  coverage: ["coverage", "covers", "scenario", "case"],
  validation: ["validat", "sanitize", "schema", "input"],
  error: ["error", "exception", "status", "code"],
  logging: ["log", "trace", "observ", "metric"],
};

/**
 * Derive the keyword set for a criterion.
 *
 * Strategy:
 * 1. Check if any key in CRITERION_KEYWORDS appears in the criterion name.
 * 2. Fall back to splitting the criterion name into tokens and using those.
 */
function keywordsForCriterion(criterion: RubricCriterion): string[] {
  const nameLower = criterion.name.toLowerCase();
  const checkLower = criterion.check.toLowerCase();
  const combined = `${nameLower} ${checkLower}`;

  for (const [key, kws] of Object.entries(CRITERION_KEYWORDS)) {
    if (combined.includes(key)) {
      return kws;
    }
  }

  // Fallback: derive from the criterion name words (skip common filler words)
  const stopWords = new Set(["covers", "a", "an", "the", "is", "are", "does", "has"]);
  return nameLower
    .split(/\W+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w));
}

// ── Core heuristic grader ─────────────────────────────────────────────────────

/**
 * Grade a step's output against its rubric using a local keyword-presence
 * heuristic.  Each criterion contributes an equal share of 100 points.
 *
 * This is the deterministic, test-safe grader.  For production use, wire in
 * {@link gradeStepWithLLM} which delegates to a Haiku-backed grader.
 *
 * @param stepName - Name of the pipeline step being graded (e.g. "spec").
 * @param output   - The text output produced by that step.
 * @param rubric   - The rubric to grade against.
 * @returns        A {@link StepEvalResult} — never contains raw output.
 */
export function gradeStep(stepName: string, output: string, rubric: Rubric): StepEvalResult {
  const outputLower = output.toLowerCase();
  const share = rubric.criteria.length > 0 ? 100 / rubric.criteria.length : 0;

  const criteria: CriterionResult[] = rubric.criteria.map((criterion) => {
    const keywords = keywordsForCriterion(criterion);
    const hit = keywords.some((kw) => outputLower.includes(kw.toLowerCase()));

    return {
      name: criterion.name,
      passed: hit,
      detail: hit
        ? `One or more keywords [${keywords.join(", ")}] found in output.`
        : `No keywords [${keywords.join(", ")}] found in output.`,
    };
  });

  const passedCount = criteria.filter((c) => c.passed).length;
  const score = Math.round(passedCount * share);

  return {
    step: stepName,
    score,
    rubric_version: rubric.version,
    criteria,
    timestamp: new Date().toISOString(),
  };
}

// ── LLM grading hook (interface only — not called in tests) ──────────────────

/**
 * Hook for Haiku-backed grading.  Callers inject the LLM client so this
 * function is never invoked during unit tests (no network calls).
 *
 * @param stepName  - Pipeline step name.
 * @param output    - Step output text.
 * @param rubric    - Rubric to grade against.
 * @param llmClient - Any object with an async `complete(prompt: string): Promise<string>` method.
 * @returns         A {@link StepEvalResult} — never contains raw output.
 */
export async function gradeStepWithLLM(
  stepName: string,
  output: string,
  rubric: Rubric,
  llmClient: { complete(prompt: string): Promise<string> },
): Promise<StepEvalResult> {
  const criteriaText = rubric.criteria.map((c, i) => `${i + 1}. ${c.check}`).join("\n");

  const prompt = `You are a strict technical grader. Score the following step output against each criterion.
For each criterion, reply with PASS or FAIL and a brief one-sentence reason.
Do NOT include the original output in your reply.

Criteria:
${criteriaText}

Step output (graded, not reproduced):
${output}

Reply in JSON: {"criteria": [{"name": "...", "passed": true/false, "detail": "..."}]}`;

  const raw = await llmClient.complete(prompt);

  let parsed: { criteria: CriterionResult[] };
  try {
    parsed = JSON.parse(raw) as { criteria: CriterionResult[] };
  } catch {
    // LLM response was not valid JSON — fall back to heuristic grader
    return gradeStep(stepName, output, rubric);
  }

  const criteriaResults: CriterionResult[] = rubric.criteria.map((c, i) => {
    const llmCriterion = parsed.criteria[i];
    if (!llmCriterion) {
      return { name: c.name, passed: false, detail: "LLM did not return this criterion." };
    }
    return {
      name: c.name,
      passed: Boolean(llmCriterion.passed),
      detail: String(llmCriterion.detail ?? ""),
    };
  });

  const share = criteriaResults.length > 0 ? 100 / criteriaResults.length : 0;
  const passedCount = criteriaResults.filter((c) => c.passed).length;
  const score = Math.round(passedCount * share);

  return {
    step: stepName,
    score,
    rubric_version: rubric.version,
    criteria: criteriaResults,
    timestamp: new Date().toISOString(),
  };
}

// ── Eval result writer ────────────────────────────────────────────────────────

/**
 * Write a {@link StepEvalResult} to:
 *   `<speqDir>/evals/runs/<timestamp>/step-<name>.json`
 *
 * IMPORTANT: The written JSON MUST NOT contain the raw step output — only
 * score, criteria pass/fail, and qualitative summary.  {@link StepEvalResult}
 * does not have an output field, so this is guaranteed structurally.
 *
 * @param speqDir - Path to the `.speq` directory.
 * @param result  - The eval result to persist.
 */
export function writeStepEvalResult(speqDir: string, result: StepEvalResult): void {
  const filePath = join(
    speqDir,
    "evals",
    "runs",
    result.timestamp,
    `step-${result.step}.json`,
  );

  mkdirSync(dirname(filePath), { recursive: true });

  // Explicitly construct the persisted object to ensure no raw output leaks in,
  // even if the result type is extended in the future.
  const persisted: StepEvalResult = {
    step: result.step,
    score: result.score,
    rubric_version: result.rubric_version,
    criteria: result.criteria,
    timestamp: result.timestamp,
  };

  writeFileSync(filePath, JSON.stringify(persisted, null, 2), "utf-8");
}

// ── Affected-step detector ────────────────────────────────────────────────────

/**
 * Compare two config objects and return the list of step names whose
 * `model` field changed.  Only `steps.<name>.model` changes trigger evals;
 * all other config changes are ignored.
 *
 * @param oldConfig - Previous config snapshot.
 * @param newConfig - Updated config snapshot.
 * @returns         Names of steps whose model changed (or that are new).
 */
export function getAffectedSteps(
  oldConfig: Record<string, unknown>,
  newConfig: Record<string, unknown>,
): string[] {
  const oldSteps = (oldConfig["steps"] ?? {}) as Record<string, Record<string, unknown>>;
  const newSteps = (newConfig["steps"] ?? {}) as Record<string, Record<string, unknown>>;

  const allStepNames = new Set([...Object.keys(oldSteps), ...Object.keys(newSteps)]);
  const affected: string[] = [];

  for (const stepName of allStepNames) {
    const oldModel = oldSteps[stepName]?.["model"];
    const newModel = newSteps[stepName]?.["model"];

    if (oldModel !== newModel) {
      affected.push(stepName);
    }
  }

  return affected;
}

// ── Built-in rubrics ──────────────────────────────────────────────────────────

/**
 * Default rubrics for each pipeline step.
 * These version strings must be bumped whenever criterion definitions change
 * so that historical eval results remain reproducible.
 */
export const STEP_RUBRICS: Record<string, Rubric> = {
  requirements: {
    version: "v1",
    criteria: [
      { name: "covers user stories", check: "covers user stories?" },
      { name: "covers acceptance criteria", check: "covers acceptance criteria?" },
      { name: "covers validation", check: "covers validation?" },
      { name: "covers error handling", check: "covers error handling?" },
    ],
  },

  spec: {
    version: "v1",
    criteria: [
      { name: "covers security", check: "covers security?" },
      { name: "covers failure", check: "covers failure modes?" },
      { name: "covers idempotency", check: "covers idempotency?" },
      { name: "covers performance", check: "covers performance?" },
    ],
  },

  plan: {
    version: "v1",
    criteria: [
      { name: "covers task breakdown", check: "covers task breakdown?" },
      { name: "covers dependencies", check: "covers dependencies?" },
      { name: "covers error handling", check: "covers error handling?" },
      { name: "covers validation", check: "covers validation?" },
    ],
  },

  implement: {
    version: "v1",
    criteria: [
      { name: "covers test coverage", check: "covers test coverage?" },
      { name: "covers error handling", check: "covers error handling?" },
      { name: "covers security", check: "covers security?" },
      { name: "covers logging", check: "covers logging and observability?" },
    ],
  },

  verify: {
    version: "v1",
    criteria: [
      { name: "covers test coverage", check: "covers test coverage?" },
      { name: "covers security", check: "covers security checks?" },
      { name: "covers performance", check: "covers performance validation?" },
      { name: "covers error handling", check: "covers error scenario validation?" },
    ],
  },
};
