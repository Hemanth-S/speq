import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PipelineConfig } from "./pipeline-config.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface StepCostEstimate {
  predicted_tokens_in: number;
  predicted_tokens_out: number;
  predicted_cost_usd: number;
}

export interface CostEstimate {
  per_step: Record<string, StepCostEstimate>;
  total_cost_usd: number;
  confidence: "low" | "medium" | "high";
  confidence_band?: { low: number; high: number };
}

export interface HaltDecision {
  halt: boolean;
  message?: string;
}

// ---------------------------------------------------------------------------
// Model card pricing (USD per 1M tokens)
// ---------------------------------------------------------------------------

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  haiku: { input: 0.25, output: 1.25 },
  sonnet: { input: 3, output: 15 },
  opus: { input: 15, output: 75 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};

// Fallback pricing when model name is not found (use haiku tier as conservative estimate)
const DEFAULT_PRICING = { input: 0.25, output: 1.25 };

// ---------------------------------------------------------------------------
// Cold-start averages (tokens per step — rough estimates)
// ---------------------------------------------------------------------------

const COLD_START_AVERAGES: Record<string, { tokens_in: number; tokens_out: number }> = {
  requirements: { tokens_in: 3000, tokens_out: 2000 },
  enrich: { tokens_in: 5000, tokens_out: 3000 },
  spec: { tokens_in: 8000, tokens_out: 5000 },
  plan: { tokens_in: 6000, tokens_out: 4000 },
  implement: { tokens_in: 20000, tokens_out: 15000 },
  verify: { tokens_in: 10000, tokens_out: 5000 },
  done: { tokens_in: 3000, tokens_out: 2000 },
};

// Default fallback for steps not in the table
const DEFAULT_COLD_START = { tokens_in: 5000, tokens_out: 3000 };

// Minimum number of historical runs needed to move beyond cold-start estimates
const MIN_RUNS_FOR_REGRESSION = 5;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve pricing for a given step's model name. The model name is a short
 * alias (e.g. "haiku", "sonnet") matching keys in MODEL_PRICING.
 */
function getPricing(modelAlias: string): { input: number; output: number } {
  // Try exact match first
  if (MODEL_PRICING[modelAlias]) return MODEL_PRICING[modelAlias];

  // Try substring match (e.g. "claude-haiku-4-5-20251001" should resolve to haiku pricing)
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (modelAlias.toLowerCase().includes(key.toLowerCase())) {
      return pricing;
    }
  }

  return DEFAULT_PRICING;
}

/**
 * Compute cost in USD given token counts and model alias.
 */
function computeCost(tokensIn: number, tokensOut: number, modelAlias: string): number {
  const pricing = getPricing(modelAlias);
  return (tokensIn / 1_000_000) * pricing.input + (tokensOut / 1_000_000) * pricing.output;
}

// ---------------------------------------------------------------------------
// Historical run loading
// ---------------------------------------------------------------------------

interface StepRecord {
  step: string;
  tokens_in: number;
  tokens_out: number;
  status: "success" | "failed";
}

interface HistoricalStep {
  tokens_in: number;
  tokens_out: number;
}

/**
 * Load per-step token histories from all completed runs in .speq/runs/.
 * Returns a map of step name -> array of {tokens_in, tokens_out} observations.
 */
function loadHistoricalStepData(speqDir: string): Map<string, HistoricalStep[]> {
  const runsDir = join(speqDir, ".speq", "runs");
  const history = new Map<string, HistoricalStep[]>();

  if (!existsSync(runsDir)) {
    return history;
  }

  let runIds: string[];
  try {
    runIds = readdirSync(runsDir).filter((entry) => entry.startsWith("run-"));
  } catch {
    return history;
  }

  for (const runId of runIds) {
    const runDir = join(runsDir, runId);

    // Try to read individual step JSON files from this run
    let files: string[];
    try {
      files = readdirSync(runDir).filter((f) => f.endsWith(".json") && f !== "summary.json");
    } catch {
      continue;
    }

    for (const file of files) {
      try {
        const raw = readFileSync(join(runDir, file), "utf-8");
        const record: StepRecord = JSON.parse(raw);

        // Only include successful steps
        if (record.status !== "success") continue;

        const step = record.step ?? file.replace(".json", "");
        if (!history.has(step)) {
          history.set(step, []);
        }
        history.get(step)!.push({
          tokens_in: record.tokens_in,
          tokens_out: record.tokens_out,
        });
      } catch {
        // Skip unreadable records
      }
    }
  }

  return history;
}

/**
 * Compute the arithmetic mean of an array of numbers.
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Compute the sample standard deviation of an array of numbers.
 */
function stddev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Predict the cost of a pipeline run given the config and available historical data.
 *
 * - With fewer than MIN_RUNS_FOR_REGRESSION historical runs: uses cold-start averages,
 *   returns confidence: "low".
 * - With 5+ runs: uses the mean of historical per-step token counts,
 *   returns confidence: "medium" (or "high" when stddev is low relative to mean).
 */
export function predictCost(config: PipelineConfig, speqDir: string): CostEstimate {
  const history = loadHistoricalStepData(speqDir);

  // Count the maximum number of observations for any single step to decide
  // whether we have enough data for regression.
  const maxObservations = history.size === 0
    ? 0
    : Math.max(...Array.from(history.values()).map((obs) => obs.length));

  const useHistorical = maxObservations >= MIN_RUNS_FOR_REGRESSION;

  const per_step: Record<string, StepCostEstimate> = {};
  let total_cost_usd = 0;

  // Band tracking (only meaningful when using historical data)
  let totalLow = 0;
  let totalHigh = 0;

  for (const [stepName, stepCfg] of Object.entries(config.steps)) {
    const modelAlias = stepCfg.model;

    let tokensIn: number;
    let tokensOut: number;
    let bandLow: number | undefined;
    let bandHigh: number | undefined;

    if (useHistorical && history.has(stepName)) {
      const obs = history.get(stepName)!;
      const inValues = obs.map((o) => o.tokens_in);
      const outValues = obs.map((o) => o.tokens_out);

      tokensIn = Math.round(mean(inValues));
      tokensOut = Math.round(mean(outValues));

      // Compute confidence band: mean ± 1 stddev
      const sdIn = stddev(inValues, tokensIn);
      const sdOut = stddev(outValues, tokensOut);
      bandLow = computeCost(Math.max(0, tokensIn - sdIn), Math.max(0, tokensOut - sdOut), modelAlias);
      bandHigh = computeCost(tokensIn + sdIn, tokensOut + sdOut, modelAlias);
    } else {
      // Cold-start fallback
      const defaults = COLD_START_AVERAGES[stepName] ?? DEFAULT_COLD_START;
      tokensIn = defaults.tokens_in;
      tokensOut = defaults.tokens_out;
    }

    const stepCost = computeCost(tokensIn, tokensOut, modelAlias);

    per_step[stepName] = {
      predicted_tokens_in: tokensIn,
      predicted_tokens_out: tokensOut,
      predicted_cost_usd: stepCost,
    };

    total_cost_usd += stepCost;

    if (bandLow !== undefined && bandHigh !== undefined) {
      totalLow += bandLow;
      totalHigh += bandHigh;
    } else {
      // Cold-start: add a ±50% band
      totalLow += stepCost * 0.5;
      totalHigh += stepCost * 1.5;
    }
  }

  // Determine confidence level
  let confidence: "low" | "medium" | "high";
  if (!useHistorical) {
    confidence = "low";
  } else {
    // High confidence: relative band width < 20%
    const bandWidth = totalHigh - totalLow;
    const relativeWidth = total_cost_usd > 0 ? bandWidth / total_cost_usd : 1;
    confidence = relativeWidth < 0.2 ? "high" : "medium";
  }

  const estimate: CostEstimate = {
    per_step,
    total_cost_usd,
    confidence,
  };

  if (useHistorical) {
    estimate.confidence_band = { low: totalLow, high: totalHigh };
  }

  return estimate;
}

/**
 * Decide whether the pipeline should halt before a step due to budget constraints.
 *
 * @param costSoFar    - Actual cost incurred so far in USD.
 * @param nextStepEstimate - Predicted cost of the next step in USD.
 * @param maxCost      - Budget ceiling in USD, or null if no budget is set.
 * @returns HaltDecision with halt: true and a user-facing message if over budget.
 */
export function shouldHaltForBudget(
  costSoFar: number,
  nextStepEstimate: number,
  maxCost: number | null,
): HaltDecision {
  // No budget enforcement when maxCost is null
  if (maxCost === null) {
    return { halt: false };
  }

  const predictedTotal = costSoFar + nextStepEstimate;

  if (predictedTotal > maxCost) {
    const message =
      `Predicted total $${predictedTotal.toFixed(2)} exceeds budget $${maxCost.toFixed(2)}. Continue? [y/N]`;
    return { halt: true, message };
  }

  return { halt: false };
}
