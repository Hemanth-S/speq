import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Runner } from "./types.js";
import { ClaudeRunner } from "./claude.js";
import { CodexRunner } from "./codex.js";

// ---------------------------------------------------------------------------
// Types for models.yaml schema
// ---------------------------------------------------------------------------

export interface ModelCard {
  snapshot?: string;
  runner: string;
  capabilities: string[];
}

export interface ModelsYaml {
  models: Record<string, ModelCard>;
  complexity_routing: Record<string, string>;
}

export interface ResolvedModel {
  /** Exact snapshot model ID, e.g. claude-haiku-4-5-20251001 */
  snapshot: string;
  /** Runner tag from the model card, e.g. "claude" or "codex" */
  runner: string;
  /** Capabilities array from the model card */
  capabilities: string[];
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const REGISTRY: Runner[] = [new ClaudeRunner(), new CodexRunner()];

/**
 * Return a copy of the runner registry (useful for testing).
 */
export function getRegistry(): Runner[] {
  return [...REGISTRY];
}

// ---------------------------------------------------------------------------
// models.yaml loading
// ---------------------------------------------------------------------------

let _cachedModels: ModelsYaml | null = null;
let _cachedModelsPath: string | null = null;

/**
 * Load models.yaml from the given root directory.
 * Results are NOT cached across different rootDirs to keep tests deterministic.
 */
export function loadModelsYaml(rootDir: string): ModelsYaml {
  const modelsPath = join(rootDir, "models.yaml");

  // Return cache only when same path is reloaded
  if (_cachedModelsPath === modelsPath && _cachedModels !== null) {
    return structuredClone(_cachedModels);
  }

  if (!existsSync(modelsPath)) {
    throw new Error(`models.yaml not found at ${modelsPath}`);
  }

  const content = readFileSync(modelsPath, "utf-8");
  const parsed = parseYaml(content) as ModelsYaml;

  _cachedModels = parsed;
  _cachedModelsPath = modelsPath;

  return structuredClone(parsed);
}

/**
 * Bust the internal models.yaml cache (useful for testing).
 */
export function clearModelsCache(): void {
  _cachedModels = null;
  _cachedModelsPath = null;
}

// ---------------------------------------------------------------------------
// Model resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a model shorthand or exact snapshot ID to a ResolvedModel.
 *
 * Resolution order:
 *  1. If `modelInput` matches a shorthand key in models.yaml  -> use that card
 *  2. If `modelInput` matches a snapshot value in models.yaml -> use that card
 *  3. Otherwise throw with the list of known identifiers
 *
 * @param modelInput - e.g. "haiku" or "claude-haiku-4-5-20251001"
 * @param rootDir    - project root where models.yaml lives
 */
export function resolveModel(modelInput: string, rootDir: string): ResolvedModel {
  const modelsYaml = loadModelsYaml(rootDir);
  const { models } = modelsYaml;

  // 1. Direct shorthand match
  if (models[modelInput]) {
    const card = models[modelInput];
    const snapshot = card.snapshot ?? modelInput; // gpt-4o-mini has no separate snapshot
    return structuredClone({
      snapshot,
      runner: card.runner,
      capabilities: card.capabilities,
    });
  }

  // 2. Match by snapshot value
  for (const [, card] of Object.entries(models)) {
    if (card.snapshot === modelInput) {
      return structuredClone({
        snapshot: modelInput,
        runner: card.runner,
        capabilities: card.capabilities,
      });
    }
  }

  // 3. Also handle exact match when the key itself has no snapshot field
  //    (e.g. gpt-4o-mini's key equals the model ID)
  const availableList = Object.keys(models).join(", ");
  throw new Error(`Unknown model: ${modelInput}. Available: ${availableList}`);
}

// ---------------------------------------------------------------------------
// Runner selection
// ---------------------------------------------------------------------------

/**
 * Return the Runner that handles `runnerTag` (e.g. "claude", "codex").
 * Throws a clear error when the runner binary would not be found.
 */
export function getRunner(runnerTag: string): Runner {
  const runner = REGISTRY.find((r) => r.name === runnerTag);
  if (!runner) {
    throw new Error(
      `No runner registered for tag "${runnerTag}". Known runners: ${REGISTRY.map((r) => r.name).join(", ")}`,
    );
  }
  return runner;
}

// ---------------------------------------------------------------------------
// Complexity routing
// ---------------------------------------------------------------------------

/**
 * Select the model shorthand for a given complexity label, merging
 * models.yaml defaults with any per-step overrides from speq.config.yaml.
 *
 * @param complexity     - e.g. "trivial", "complex" (may be undefined)
 * @param stepDefault    - the model field from the step's StepConfig
 * @param stepOverrides  - the complexity_routing from StepConfig (if any)
 * @param rootDir        - project root where models.yaml lives
 */
export function resolveComplexityModel(
  complexity: string | undefined,
  stepDefault: string,
  stepOverrides: Record<string, string> | undefined,
  rootDir: string,
): string {
  if (!complexity) {
    return stepDefault;
  }

  // Step-level overrides win over models.yaml defaults
  if (stepOverrides && stepOverrides[complexity]) {
    return stepOverrides[complexity];
  }

  const modelsYaml = loadModelsYaml(rootDir);
  const yamlRouting = modelsYaml.complexity_routing;

  if (yamlRouting && yamlRouting[complexity]) {
    return yamlRouting[complexity];
  }

  // Unknown complexity label — fall back to step default
  return stepDefault;
}
