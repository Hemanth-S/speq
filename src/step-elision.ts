import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { parse as parseYaml } from "yaml";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ElisionDecision {
  step: string;
  action: "elided" | "executed";
  reason?: string;
  /**
   * Always true: security sub-gates (ADR compliance, injection tests) must run
   * regardless of whether the main step was elided or executed.
   */
  runSecurityGate: boolean;
}

// ── skip_if parsing ───────────────────────────────────────────────────────────

/**
 * Parse a `skip_if` expression of the form `"capability >= <name>"`.
 * Returns the capability name, or null if the expression is absent / malformed.
 */
function parseSkipIf(skipIf: string | undefined): string | null {
  if (!skipIf) return null;
  // Expected format: "capability >= <name>"
  const match = skipIf.trim().match(/^capability\s*>=\s*(\S+)$/);
  if (!match) return null;
  return match[1];
}

// ── Core decision function ────────────────────────────────────────────────────

/**
 * Decide whether a pipeline step should be elided.
 *
 * @param stepName           - Name of the step (e.g. "verify").
 * @param stepConfig         - Step configuration object (may include `skip_if`).
 * @param modelCapabilities  - Capabilities declared by the configured model.
 * @returns                  An ElisionDecision describing the outcome.
 */
export function shouldElideStep(
  stepName: string,
  stepConfig: { skip_if?: string },
  modelCapabilities: string[],
): ElisionDecision {
  const requiredCapability = parseSkipIf(stepConfig.skip_if);

  // No skip_if → always execute
  if (!requiredCapability) {
    return {
      step: stepName,
      action: "executed",
      runSecurityGate: true,
    };
  }

  const hasCapability = modelCapabilities.includes(requiredCapability);

  if (hasCapability) {
    return {
      step: stepName,
      action: "elided",
      reason: `capability ${requiredCapability}`,
      // P0: security sub-gate must still run even when elided
      runSecurityGate: true,
    };
  }

  return {
    step: stepName,
    action: "executed",
    runSecurityGate: true,
  };
}

// ── Elision log writer ────────────────────────────────────────────────────────

/**
 * Write elision decisions to `.speq/runs/<run-id>/elisions.json`.
 * Creates parent directories if they do not exist.
 * Each run-id gets its own independent file; overwriting is idempotent.
 *
 * @param speqDir   - Path to the `.speq` directory.
 * @param runId     - Unique identifier for this pipeline run.
 * @param decisions - Array of elision decisions to persist.
 */
export function writeElisionLog(
  speqDir: string,
  runId: string,
  decisions: ElisionDecision[],
): void {
  const logPath = join(speqDir, "runs", runId, "elisions.json");
  mkdirSync(dirname(logPath), { recursive: true });
  writeFileSync(logPath, JSON.stringify(decisions, null, 2), "utf-8");
}

// ── models.yaml capability loader ─────────────────────────────────────────────

interface ModelEntry {
  snapshot?: string;
  runner?: string;
  capabilities?: string[];
}

interface ModelsYaml {
  models?: Record<string, ModelEntry>;
}

/**
 * Load the capabilities for a named model from `models.yaml` in the project root.
 *
 * Returns an empty array (and emits a console.warn) if:
 * - `models.yaml` does not exist
 * - The model name is not found
 * - The model entry has no `capabilities` field
 *
 * @param projectDir - Project root directory containing `models.yaml`.
 * @param modelName  - The model alias to look up (e.g. "opus").
 */
export function loadModelCapabilities(projectDir: string, modelName: string): string[] {
  const modelsPath = join(projectDir, "models.yaml");

  if (!existsSync(modelsPath)) {
    console.warn(
      `[speq] models.yaml not found at ${modelsPath}. ` +
        `Cannot evaluate capabilities for model "${modelName}". Step will run normally.`,
    );
    return [];
  }

  let parsed: ModelsYaml;
  try {
    parsed = parseYaml(readFileSync(modelsPath, "utf-8")) as ModelsYaml;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[speq] Failed to parse models.yaml: ${msg}. Step will run normally.`);
    return [];
  }

  const modelEntry = parsed?.models?.[modelName];

  if (!modelEntry) {
    console.warn(
      `[speq] Model "${modelName}" not found in models.yaml. Step will run normally.`,
    );
    return [];
  }

  if (!Array.isArray(modelEntry.capabilities)) {
    console.warn(
      `[speq] Model "${modelName}" has no capabilities field in models.yaml. ` +
        `No capabilities = no elision. Step will run normally.`,
    );
    return [];
  }

  return modelEntry.capabilities;
}
