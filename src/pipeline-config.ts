import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

export interface StepConfig {
  model: string;
  prompt_version: string;
  impl?: string;
  skip_if?: string;
  runner?: string;
  complexity_routing?: Record<string, string>;
}

export interface PipelineConfig {
  pipeline: {
    caveman: boolean;
  };
  steps: Record<string, StepConfig>;
  adr: {
    path: string;
  };
  evals: {
    fixtures_path: string;
  };
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  pipeline: { caveman: true },
  steps: {
    requirements: { model: "haiku", prompt_version: "v1" },
    enrich: { model: "haiku", prompt_version: "v1" },
    spec: { model: "haiku", prompt_version: "v1" },
    plan: { model: "sonnet", prompt_version: "v1" },
    implement: { model: "sonnet", prompt_version: "v1", impl: "sequential" },
    verify: { model: "sonnet", prompt_version: "v1" },
    done: { model: "haiku", prompt_version: "v1" },
  },
  adr: { path: "docs/adr" },
  evals: { fixtures_path: ".speq/evals/fixtures" },
};

const VALID_TOP_LEVEL_KEYS = ["pipeline", "steps", "adr", "evals"];
const SECRET_PATTERNS = [/_secret$/i, /_token$/i, /^secret_/i, /^token_/i];

export interface LoadConfigOptions {
  overrides?: Record<string, string>;
}

/**
 * Load, validate, and merge speq pipeline configuration.
 * Precedence: CLI overrides > env vars > YAML file > shipped defaults.
 */
export function loadConfig(
  projectDir: string,
  options?: LoadConfigOptions,
): PipelineConfig {
  // Start with defaults (deep clone)
  const config: PipelineConfig = structuredClone(DEFAULT_PIPELINE_CONFIG);

  // Layer 3: YAML file
  const yamlPath = join(projectDir, "speq.config.yaml");
  if (existsSync(yamlPath)) {
    const content = readFileSync(yamlPath, "utf-8");
    let parsed: unknown;
    try {
      parsed = parseYaml(content);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse speq.config.yaml: ${msg}`);
    }

    if (parsed && typeof parsed === "object") {
      validateRaw(parsed as Record<string, unknown>);
      mergeDeep(config as unknown as Record<string, unknown>, parsed as Record<string, unknown>);
    }
  }

  // Layer 2: Env vars (SPEQ_STEPS_IMPLEMENT_MODEL -> steps.implement.model)
  applyEnvOverrides(config);

  // Layer 1: CLI overrides (highest precedence)
  if (options?.overrides) {
    for (const [dottedPath, value] of Object.entries(options.overrides)) {
      setByPath(config as unknown as Record<string, unknown>, dottedPath, value);
    }
  }

  return config;
}

function validateRaw(raw: Record<string, unknown>): void {
  // Check for unknown top-level keys
  for (const key of Object.keys(raw)) {
    if (!VALID_TOP_LEVEL_KEYS.includes(key)) {
      const closest = findClosest(key, VALID_TOP_LEVEL_KEYS);
      throw new Error(
        `Unknown config key "${key}"${closest ? ` — did you mean "${closest}"?` : ""}`,
      );
    }
  }

  // Check for secret field names recursively
  checkForSecrets(raw, "");
}

function checkForSecrets(obj: unknown, path: string): void {
  if (!obj || typeof obj !== "object") return;

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const fullPath = path ? `${path}.${key}` : key;
    if (SECRET_PATTERNS.some((p) => p.test(key))) {
      throw new Error(
        `Config field "${fullPath}" looks like a secret. Secrets must come from environment variables, not config files.`,
      );
    }
    if (value && typeof value === "object") {
      checkForSecrets(value, fullPath);
    }
  }
}

function mergeDeep(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      mergeDeep(
        target[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      target[key] = value;
    }
  }
}

function applyEnvOverrides(config: PipelineConfig): void {
  const prefix = "SPEQ_";
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith(prefix) || !value) continue;
    // SPEQ_STEPS_IMPLEMENT_MODEL -> steps.implement.model
    const dottedPath = key
      .slice(prefix.length)
      .toLowerCase()
      .replace(/_/g, ".");
    // Reconstruct path: steps.implement.model
    // The env var uses underscores for both level separators and word separators.
    // Convention: SPEQ_<SECTION>_<SUBSECTION>_<FIELD>
    // We map greedily: try to match known config paths.
    setByPathBestEffort(config, dottedPath, value);
  }
}

function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part] || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  const lastPart = parts[parts.length - 1];
  // Convert string booleans
  if (value === "true") current[lastPart] = true;
  else if (value === "false") current[lastPart] = false;
  else current[lastPart] = value;
}

function setByPathBestEffort(
  config: PipelineConfig,
  dottedPath: string,
  value: string,
): void {
  // Try known patterns for env var mapping
  // steps.<step>.<field> is the most common
  const parts = dottedPath.split(".");

  if (parts.length >= 3 && parts[0] === "steps") {
    const stepName = parts[1];
    const field = parts.slice(2).join("_");
    if (config.steps[stepName]) {
      (config.steps[stepName] as unknown as Record<string, unknown>)[field] = value;
      return;
    }
  }

  // Generic path set
  setByPath(config as unknown as Record<string, unknown>, dottedPath, value);
}

function findClosest(input: string, candidates: string[]): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const dist = levenshtein(input.toLowerCase(), c.toLowerCase());
    if (dist < bestDist && dist <= 3) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}
