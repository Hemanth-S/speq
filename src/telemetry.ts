import { mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StepRecord {
  step: string;
  model: string;
  tokens_in: number;
  tokens_out: number;
  wall_clock_ms: number;
  retry_count: number;
  tool_call_count: number;
  status: "success" | "failed";
  source: "exact" | "estimated";
}

export interface RunSummary {
  run_id: string;
  total_tokens_in: number;
  total_tokens_out: number;
  total_wall_clock_ms: number;
  step_count: number;
  completed_steps: number;
  status: "pass" | "failed";
  estimated_cost_usd: number;
}

// ---------------------------------------------------------------------------
// Cost estimation
// ---------------------------------------------------------------------------

// Conservative blended per-token pricing in USD (per 1 M tokens).
// Input and output tokens are priced separately on the real API; we use a
// simplified average here since we may not always know which model was used.
const COST_PER_M_INPUT_TOKENS_USD = 0.25; // Claude Haiku tier
const COST_PER_M_OUTPUT_TOKENS_USD = 1.25;

function estimateCostUsd(tokens_in: number, tokens_out: number): number {
  return (
    (tokens_in / 1_000_000) * COST_PER_M_INPUT_TOKENS_USD +
    (tokens_out / 1_000_000) * COST_PER_M_OUTPUT_TOKENS_USD
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a timestamp-based run identifier, e.g. "run-20260513-134500".
 */
export function generateRunId(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());
  return `run-${year}${month}${day}-${hours}${minutes}${seconds}`;
}

/**
 * Write a per-step usage record to `.speq/runs/<run-id>/<step>.json`.
 *
 * Failures are logged to stderr and swallowed — the pipeline must not crash
 * because of a telemetry write failure.
 */
export function writeStepRecord(speqDir: string, runId: string, record: StepRecord): void {
  const runDir = join(speqDir, ".speq", "runs", runId);

  try {
    mkdirSync(runDir, { recursive: true });

    // Only write the defined metadata fields — never any prompt/content/response.
    const safe: StepRecord = {
      step: record.step,
      model: record.model,
      tokens_in: record.tokens_in,
      tokens_out: record.tokens_out,
      wall_clock_ms: record.wall_clock_ms,
      retry_count: record.retry_count,
      tool_call_count: record.tool_call_count,
      status: record.status,
      source: record.source,
    };

    writeFileSync(join(runDir, `${record.step}.json`), JSON.stringify(safe, null, 2), "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `[speq warn] Failed to write telemetry record for step "${record.step}" (run ${runId}): ${message}\n`,
    );
  }
}

/**
 * Aggregate all per-step records for the given run into a summary and write it
 * to `.speq/runs/<run-id>/summary.json`.
 *
 * Returns the computed RunSummary.
 */
export function computeRunSummary(speqDir: string, runId: string): RunSummary {
  const runDir = join(speqDir, ".speq", "runs", runId);

  let files: string[];
  try {
    files = readdirSync(runDir).filter((f) => f.endsWith(".json") && f !== "summary.json");
  } catch {
    files = [];
  }

  const records: StepRecord[] = [];
  for (const file of files) {
    try {
      const raw = readFileSync(join(runDir, file), "utf-8");
      records.push(JSON.parse(raw) as StepRecord);
    } catch {
      // skip unreadable records
    }
  }

  const successRecords = records.filter((r) => r.status === "success");
  const hasFailure = records.some((r) => r.status === "failed");

  const total_tokens_in = records.reduce((s, r) => s + r.tokens_in, 0);
  const total_tokens_out = records.reduce((s, r) => s + r.tokens_out, 0);
  const total_wall_clock_ms = records.reduce((s, r) => s + r.wall_clock_ms, 0);

  const summary: RunSummary = {
    run_id: runId,
    total_tokens_in,
    total_tokens_out,
    total_wall_clock_ms,
    step_count: records.length,
    completed_steps: successRecords.length,
    status: hasFailure ? "failed" : "pass",
    estimated_cost_usd: estimateCostUsd(total_tokens_in, total_tokens_out),
  };

  try {
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, "summary.json"), JSON.stringify(summary, null, 2), "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `[speq warn] Failed to write summary for run ${runId}: ${message}\n`,
    );
  }

  return summary;
}
