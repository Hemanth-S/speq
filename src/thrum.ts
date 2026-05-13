import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Decision {
  type: "decision";
  step: string;
  task: string;
  action: "skipped" | "rerouted" | "retried" | "completed";
  reason: string;
  timestamp: string;
}

/** Fields that are forbidden in any decision object (secrets guard, P0). */
const FORBIDDEN_FIELDS: ReadonlyArray<string> = [
  "api_key",
  "token",
  "secret",
  "password",
];

// ── Secrets validation (P0) ───────────────────────────────────────────────────

/**
 * Validate that a candidate decision payload contains no forbidden fields.
 * Throws a descriptive Error if any forbidden key is found.
 */
function assertNoSecrets(
  payload: Record<string, unknown>,
): void {
  for (const field of FORBIDDEN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      throw new Error(
        `[speq/thrum] Forbidden field "${field}" detected in decision payload. ` +
          `Decision objects must not contain secrets (api_key, token, secret, password).`,
      );
    }
  }
}

// ── Scratchpad path ───────────────────────────────────────────────────────────

function decisionsFilePath(speqDir: string, runId: string): string {
  return join(speqDir, "runs", runId, "decisions.json");
}

// ── isThrumAvailable ─────────────────────────────────────────────────────────

/**
 * Check whether the `thrum` CLI binary is available on the current PATH.
 * Returns false if the binary cannot be found or the check itself fails.
 */
export function isThrumAvailable(): boolean {
  try {
    const result = spawnSync("thrum", ["--version"], {
      shell: false,
      encoding: "utf-8",
      stdio: "pipe",
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

// ── writeDecision ─────────────────────────────────────────────────────────────

/**
 * Write a decision to the fallback scratchpad at
 * `.speq/runs/<run-id>/decisions.json`.
 *
 * - Validates that the payload contains no forbidden secret fields (P0).
 * - Deduplicates by task+action key before appending (P1).
 * - If the write fails (e.g. permissions), emits a warning to stderr and
 *   continues without throwing — pipeline must not crash (P2).
 *
 * @param speqDir  - Path to the `.speq` directory.
 * @param runId    - Unique identifier for this pipeline run.
 * @param decision - Decision payload (without type/timestamp — added here).
 */
export function writeDecision(
  speqDir: string,
  runId: string,
  decision: Omit<Decision, "type" | "timestamp"> & Record<string, unknown>,
): void {
  // P0: secrets guard — throw before any I/O
  assertNoSecrets(decision as Record<string, unknown>);

  const logPath = decisionsFilePath(speqDir, runId);
  const full: Decision = {
    type: "decision",
    step: decision.step,
    task: decision.task,
    action: decision.action,
    reason: decision.reason,
    timestamp: new Date().toISOString(),
  };

  try {
    mkdirSync(dirname(logPath), { recursive: true });

    // Load existing decisions for deduplication
    let existing: Decision[] = [];
    if (existsSync(logPath)) {
      try {
        existing = JSON.parse(readFileSync(logPath, "utf-8")) as Decision[];
      } catch {
        existing = [];
      }
    }

    // Deduplicate by task+action key (P1)
    const key = `${full.task}:${full.action}`;
    const alreadyExists = existing.some(
      (d) => `${d.task}:${d.action}` === key,
    );
    if (alreadyExists) {
      return; // idempotent — skip duplicate
    }

    existing.push(full);
    writeFileSync(logPath, JSON.stringify(existing, null, 2), "utf-8");
  } catch (err) {
    // P2: graceful degradation — warn, never crash the pipeline
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `[speq/thrum] thrum unavailable — decisions not persisted: ${msg}\n`,
    );
  }
}

// ── readDecisions ─────────────────────────────────────────────────────────────

export interface ReadDecisionsOptions {
  /**
   * When true and no decisions log is found, emit the Beads fallback warning
   * to console.warn (used by /ship --resume when thrum is absent).
   */
  warnIfMissing?: boolean;
}

/**
 * Read all decisions for a run from the scratchpad.
 * Returns an empty array if no log file exists.
 *
 * @param speqDir         - Path to the `.speq` directory.
 * @param runId           - Pipeline run identifier.
 * @param options.warnIfMissing - Emit fallback warning when the log is absent.
 */
export function readDecisions(
  speqDir: string,
  runId: string,
  options: ReadDecisionsOptions = {},
): Decision[] {
  const logPath = decisionsFilePath(speqDir, runId);

  if (!existsSync(logPath)) {
    if (options.warnIfMissing) {
      console.warn(
        "[speq/thrum] thrum not available — resuming from Beads state only",
      );
    }
    return [];
  }

  try {
    return JSON.parse(readFileSync(logPath, "utf-8")) as Decision[];
  } catch {
    return [];
  }
}

// ── formatDecisionsForPR ──────────────────────────────────────────────────────

/**
 * Format a list of decisions as a markdown "## Decisions" section for the PR
 * description.
 *
 * Returns null when the list is empty (caller omits the section — P2).
 *
 * @param decisions - Array of Decision objects.
 */
export function formatDecisionsForPR(decisions: Decision[]): string | null {
  if (decisions.length === 0) {
    return null;
  }

  const bullets = decisions
    .map((d) => `- **${d.task}** (${d.step}): ${d.action} — ${d.reason}`)
    .join("\n");

  return `## Decisions\n\n${bullets}\n`;
}
