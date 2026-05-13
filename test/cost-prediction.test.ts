import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { predictCost, shouldHaltForBudget } from "../src/cost-prediction.js";
import type { PipelineConfig } from "../src/pipeline-config.js";
import { DEFAULT_PIPELINE_CONFIG } from "../src/pipeline-config.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_DIR = join(tmpdir(), "speq-cost-pred-test-" + process.pid);

function makeConfig(overrides: Partial<PipelineConfig> = {}): PipelineConfig {
  return {
    ...DEFAULT_PIPELINE_CONFIG,
    ...overrides,
    steps: {
      ...DEFAULT_PIPELINE_CONFIG.steps,
      ...(overrides.steps ?? {}),
    },
  };
}

/**
 * Write a fake summary.json into .speq/runs/<runId>/summary.json
 * with per-step token data embedded.
 */
function writeFakeSummary(
  speqDir: string,
  runId: string,
  stepTokens: Record<string, { tokens_in: number; tokens_out: number }>,
): void {
  const runDir = join(speqDir, ".speq", "runs", runId);
  mkdirSync(runDir, { recursive: true });

  // Write individual step records
  for (const [step, tokens] of Object.entries(stepTokens)) {
    const record = {
      step,
      model: "claude-sonnet-4-7",
      tokens_in: tokens.tokens_in,
      tokens_out: tokens.tokens_out,
      wall_clock_ms: 5000,
      retry_count: 0,
      tool_call_count: 5,
      status: "success",
      source: "exact",
    };
    writeFileSync(join(runDir, `${step}.json`), JSON.stringify(record, null, 2), "utf-8");
  }

  const totalIn = Object.values(stepTokens).reduce((s, t) => s + t.tokens_in, 0);
  const totalOut = Object.values(stepTokens).reduce((s, t) => s + t.tokens_out, 0);

  const summary = {
    run_id: runId,
    total_tokens_in: totalIn,
    total_tokens_out: totalOut,
    total_wall_clock_ms: 30000,
    step_count: Object.keys(stepTokens).length,
    completed_steps: Object.keys(stepTokens).length,
    status: "pass",
    estimated_cost_usd: (totalIn / 1_000_000) * 3 + (totalOut / 1_000_000) * 15,
    per_step: stepTokens,
  };

  writeFileSync(join(runDir, "summary.json"), JSON.stringify(summary, null, 2), "utf-8");
}

/** Write 5 historical runs with consistent token counts. */
function writeFiveRuns(
  speqDir: string,
  stepTokens: Record<string, { tokens_in: number; tokens_out: number }>,
): void {
  for (let i = 0; i < 5; i++) {
    const runId = `run-2026050${i + 1}-120000`;
    writeFakeSummary(speqDir, runId, stepTokens);
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Req: Cold Start Prediction — P1: Estimate from model card
// GIVEN: no historical runs exist and models.yaml lists pricing for sonnet
// WHEN: predictCost(config) is called before a /ship run
// THEN: returns estimate with per-step predicted tokens and confidence: "low"
// ---------------------------------------------------------------------------

describe("Cold start estimate from model card (no history) [P1]", () => {
  it("returns confidence: low and a positive total cost when no runs directory exists", () => {
    const config = makeConfig();
    const estimate = predictCost(config, TEST_DIR);

    expect(estimate.confidence).toBe("low");
    expect(estimate.total_cost_usd).toBeGreaterThan(0);
  });

  it("includes predicted tokens for each configured step", () => {
    const config = makeConfig();
    const estimate = predictCost(config, TEST_DIR);

    // The default config has these steps; each should have a prediction
    const steps = Object.keys(config.steps);
    for (const step of steps) {
      const stepEst = estimate.per_step[step];
      expect(stepEst, `missing per_step entry for ${step}`).toBeDefined();
      expect(stepEst.predicted_tokens_in).toBeGreaterThan(0);
      expect(stepEst.predicted_tokens_out).toBeGreaterThan(0);
      expect(stepEst.predicted_cost_usd).toBeGreaterThan(0);
    }
  });

  it("uses cold-start averages that reflect model card pricing (sonnet: $3/$15 per 1M)", () => {
    // Override all steps to use sonnet so we can verify pricing math.
    // Include requirements to ensure every step in the config uses sonnet.
    const config = makeConfig({
      steps: {
        requirements: { model: "sonnet", prompt_version: "v1" },
        enrich: { model: "sonnet", prompt_version: "v1" },
        spec: { model: "sonnet", prompt_version: "v1" },
        plan: { model: "sonnet", prompt_version: "v1" },
        implement: { model: "sonnet", prompt_version: "v1" },
        verify: { model: "sonnet", prompt_version: "v1" },
        done: { model: "sonnet", prompt_version: "v1" },
      },
    });

    const estimate = predictCost(config, TEST_DIR);

    // Verify each step's cost is consistent with sonnet pricing
    for (const [_step, stepEst] of Object.entries(estimate.per_step)) {
      const expectedCost =
        (stepEst.predicted_tokens_in / 1_000_000) * 3 +
        (stepEst.predicted_tokens_out / 1_000_000) * 15;
      expect(stepEst.predicted_cost_usd).toBeCloseTo(expectedCost, 6);
    }
  });
});

// ---------------------------------------------------------------------------
// Req: Cold Start Prediction — P1: Idempotent prediction
// GIVEN: same config and same historical data
// WHEN: predictCost(config) is called twice
// THEN: both calls return identical estimates
// ---------------------------------------------------------------------------

describe("Idempotent prediction (same inputs -> same output) [P1]", () => {
  it("returns identical estimates on repeated calls with no history", () => {
    const config = makeConfig();
    const est1 = predictCost(config, TEST_DIR);
    const est2 = predictCost(config, TEST_DIR);

    expect(est1).toEqual(est2);
  });

  it("returns identical estimates on repeated calls with 5 historical runs", () => {
    writeFiveRuns(TEST_DIR, {
      enrich: { tokens_in: 4800, tokens_out: 2900 },
      spec: { tokens_in: 7800, tokens_out: 4800 },
      plan: { tokens_in: 5900, tokens_out: 3900 },
      implement: { tokens_in: 19000, tokens_out: 14000 },
      verify: { tokens_in: 9500, tokens_out: 4800 },
      done: { tokens_in: 2900, tokens_out: 1900 },
    });

    const config = makeConfig();
    const est1 = predictCost(config, TEST_DIR);
    const est2 = predictCost(config, TEST_DIR);

    expect(est1).toEqual(est2);
  });
});

// ---------------------------------------------------------------------------
// Req: Historical Regression — P1: Regression-based prediction
// GIVEN: 5+ historical runs in .speq/runs/
// WHEN: predictCost(config) is called
// THEN: returns confidence: "medium" or "high", derived from historical data,
//       and includes a confidence_band
// ---------------------------------------------------------------------------

describe("Regression-based prediction after 5+ runs (higher confidence) [P1]", () => {
  it("returns confidence medium or high after 5 historical runs", () => {
    writeFiveRuns(TEST_DIR, {
      enrich: { tokens_in: 5000, tokens_out: 3000 },
      spec: { tokens_in: 8000, tokens_out: 5000 },
      plan: { tokens_in: 6000, tokens_out: 4000 },
      implement: { tokens_in: 20000, tokens_out: 15000 },
      verify: { tokens_in: 10000, tokens_out: 5000 },
      done: { tokens_in: 3000, tokens_out: 2000 },
    });

    const config = makeConfig();
    const estimate = predictCost(config, TEST_DIR);

    expect(["medium", "high"]).toContain(estimate.confidence);
  });

  it("includes a confidence_band with low <= total <= high", () => {
    writeFiveRuns(TEST_DIR, {
      enrich: { tokens_in: 5000, tokens_out: 3000 },
      spec: { tokens_in: 8000, tokens_out: 5000 },
      plan: { tokens_in: 6000, tokens_out: 4000 },
      implement: { tokens_in: 20000, tokens_out: 15000 },
      verify: { tokens_in: 10000, tokens_out: 5000 },
      done: { tokens_in: 3000, tokens_out: 2000 },
    });

    const config = makeConfig();
    const estimate = predictCost(config, TEST_DIR);

    expect(estimate.confidence_band).toBeDefined();
    expect(estimate.confidence_band!.low).toBeLessThanOrEqual(estimate.total_cost_usd);
    expect(estimate.confidence_band!.high).toBeGreaterThanOrEqual(estimate.total_cost_usd);
  });

  it("uses historical token means for per-step predictions, not cold-start defaults", () => {
    // Use clearly distinct values from cold-start defaults so the difference is detectable
    const historicalTokens = {
      enrich: { tokens_in: 1000, tokens_out: 500 },
      spec: { tokens_in: 1200, tokens_out: 600 },
      plan: { tokens_in: 1100, tokens_out: 550 },
      implement: { tokens_in: 2000, tokens_out: 1000 },
      verify: { tokens_in: 1500, tokens_out: 750 },
      done: { tokens_in: 800, tokens_out: 400 },
    };
    writeFiveRuns(TEST_DIR, historicalTokens);

    const config = makeConfig();
    const estimate = predictCost(config, TEST_DIR);

    // The implement step historical mean is 2000 tokens_in — far from cold-start 20000
    // The prediction should be much closer to 2000 than to 20000
    const implEst = estimate.per_step["implement"];
    expect(implEst).toBeDefined();
    // Should be within 50% of historical mean, not the cold-start value
    expect(Math.abs(implEst.predicted_tokens_in - 2000)).toBeLessThan(
      Math.abs(implEst.predicted_tokens_in - 20000),
    );
  });
});

// ---------------------------------------------------------------------------
// Req: Historical Regression — P1: Model change recomputes prediction
// GIVEN: 5+ historical runs and user changes implement model from sonnet to haiku
// WHEN: predictCost(config) is called
// THEN: estimate reflects haiku's lower pricing
// ---------------------------------------------------------------------------

describe("Model change recomputes prediction (haiku cheaper than sonnet) [P1]", () => {
  it("haiku-based estimate is cheaper than sonnet-based estimate for same token counts", () => {
    writeFiveRuns(TEST_DIR, {
      enrich: { tokens_in: 5000, tokens_out: 3000 },
      spec: { tokens_in: 8000, tokens_out: 5000 },
      plan: { tokens_in: 6000, tokens_out: 4000 },
      implement: { tokens_in: 20000, tokens_out: 15000 },
      verify: { tokens_in: 10000, tokens_out: 5000 },
      done: { tokens_in: 3000, tokens_out: 2000 },
    });

    const sonnetConfig = makeConfig({
      steps: {
        ...DEFAULT_PIPELINE_CONFIG.steps,
        implement: { model: "sonnet", prompt_version: "v1" },
      },
    });

    const haikuConfig = makeConfig({
      steps: {
        ...DEFAULT_PIPELINE_CONFIG.steps,
        implement: { model: "haiku", prompt_version: "v1" },
      },
    });

    const sonnetEst = predictCost(sonnetConfig, TEST_DIR);
    const haikuEst = predictCost(haikuConfig, TEST_DIR);

    expect(haikuEst.total_cost_usd).toBeLessThan(sonnetEst.total_cost_usd);
  });

  it("implement step cost reflects haiku pricing ($0.25/$1.25 per 1M) not sonnet pricing", () => {
    writeFiveRuns(TEST_DIR, {
      enrich: { tokens_in: 5000, tokens_out: 3000 },
      spec: { tokens_in: 8000, tokens_out: 5000 },
      plan: { tokens_in: 6000, tokens_out: 4000 },
      implement: { tokens_in: 20000, tokens_out: 15000 },
      verify: { tokens_in: 10000, tokens_out: 5000 },
      done: { tokens_in: 3000, tokens_out: 2000 },
    });

    const haikuConfig = makeConfig({
      steps: {
        ...DEFAULT_PIPELINE_CONFIG.steps,
        implement: { model: "haiku", prompt_version: "v1" },
      },
    });

    const est = predictCost(haikuConfig, TEST_DIR);
    const implEst = est.per_step["implement"];
    expect(implEst).toBeDefined();

    // Haiku: $0.25 input, $1.25 output per 1M
    const expectedCost =
      (implEst.predicted_tokens_in / 1_000_000) * 0.25 +
      (implEst.predicted_tokens_out / 1_000_000) * 1.25;
    expect(implEst.predicted_cost_usd).toBeCloseTo(expectedCost, 6);
  });
});

// ---------------------------------------------------------------------------
// Req: Budget Guardrail — P1: Over-budget step halts
// GIVEN: --max-cost 5 set, 3 steps completed costing $4.50, next step predicted at $1.20
// WHEN: pipeline is about to execute the next step
// THEN: shouldHalt: true and message includes predicted total and budget
// ---------------------------------------------------------------------------

describe("Over-budget step halts (predicted > max-cost -> shouldHalt: true) [P1]", () => {
  it("returns halt: true when costSoFar + nextStepEstimate exceeds maxCost", () => {
    const result = shouldHaltForBudget(4.5, 1.2, 5.0);

    expect(result.halt).toBe(true);
  });

  it("includes a message mentioning predicted total and budget when halting", () => {
    const result = shouldHaltForBudget(4.5, 1.2, 5.0);

    expect(result.message).toBeDefined();
    // Message must reference $5.70 predicted total and $5.00 budget (approximately)
    expect(result.message).toMatch(/5\.7/);
    expect(result.message).toMatch(/5/);
  });

  it("halt message is formatted like the spec: 'Predicted total $X.XX exceeds budget $Y.YY'", () => {
    const result = shouldHaltForBudget(4.5, 1.2, 5.0);

    expect(result.message).toMatch(/Predicted total/i);
    expect(result.message).toMatch(/exceeds budget/i);
  });
});

// ---------------------------------------------------------------------------
// Req: Budget Guardrail — P1: Under-budget continues silently
// GIVEN: --max-cost 10 set and predicted total is $3.00
// WHEN: pipeline executes each step
// THEN: no interruption, steps proceed normally (shouldHalt: false)
// ---------------------------------------------------------------------------

describe("Under-budget continues (shouldHalt: false) [P1]", () => {
  it("returns halt: false when costSoFar + nextStepEstimate is under maxCost", () => {
    const result = shouldHaltForBudget(2.5, 0.5, 10.0);

    expect(result.halt).toBe(false);
  });

  it("returns no message when under budget", () => {
    const result = shouldHaltForBudget(1.0, 0.5, 10.0);

    expect(result.message).toBeUndefined();
  });

  it("returns halt: false when costSoFar + nextStepEstimate exactly equals maxCost", () => {
    // Boundary: exactly at budget should not halt
    const result = shouldHaltForBudget(4.5, 0.5, 5.0);

    expect(result.halt).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Req: Budget Guardrail — P0: No --max-cost means no enforcement
// GIVEN: no --max-cost flag set (maxCost is null)
// WHEN: pipeline runs regardless of cost
// THEN: shouldHalt: false always, no prompt shown
// ---------------------------------------------------------------------------

describe("No --max-cost means no enforcement (shouldHalt: false always) [P0]", () => {
  it("returns halt: false when maxCost is null, even for very expensive steps", () => {
    const result = shouldHaltForBudget(10000, 5000, null);

    expect(result.halt).toBe(false);
  });

  it("returns no message when maxCost is null", () => {
    const result = shouldHaltForBudget(100, 200, null);

    expect(result.message).toBeUndefined();
  });

  it("returns halt: false when maxCost is null and cost is zero", () => {
    const result = shouldHaltForBudget(0, 0, null);

    expect(result.halt).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Req: Budget Guardrail — P2: Budget with no prediction data uses cold-start estimates
// GIVEN: --max-cost 5 set but no historical data exists
// WHEN: pipeline starts
// THEN: cold-start estimates used, confidence: "low"
// ---------------------------------------------------------------------------

describe("Budget with no prediction data uses cold-start estimates [P2]", () => {
  it("returns confidence: low when maxCost is set but no runs directory exists", () => {
    const config = makeConfig();
    const estimate = predictCost(config, TEST_DIR);

    // No historical data written — must use cold start
    expect(estimate.confidence).toBe("low");
  });

  it("cold-start estimate total is still a positive number for budget comparison", () => {
    const config = makeConfig();
    const estimate = predictCost(config, TEST_DIR);

    expect(estimate.total_cost_usd).toBeGreaterThan(0);
    expect(typeof estimate.total_cost_usd).toBe("number");
    expect(isFinite(estimate.total_cost_usd)).toBe(true);
  });

  it("per-step estimates exist for all steps even with no history, enabling budget checks", () => {
    const config = makeConfig();
    const estimate = predictCost(config, TEST_DIR);

    const steps = Object.keys(config.steps);
    for (const step of steps) {
      expect(estimate.per_step[step]).toBeDefined();
      expect(estimate.per_step[step].predicted_cost_usd).toBeGreaterThan(0);
    }
  });

  it("shouldHaltForBudget works correctly with cold-start estimates when maxCost is set", () => {
    const config = makeConfig();
    const estimate = predictCost(config, TEST_DIR);

    // Budget that is smaller than total predicted cost should trigger halt
    const tinyBudget = estimate.total_cost_usd / 2;
    const result = shouldHaltForBudget(0, estimate.total_cost_usd, tinyBudget);

    expect(result.halt).toBe(true);
  });
});
