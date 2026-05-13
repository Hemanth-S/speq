import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { loadConfig, DEFAULT_PIPELINE_CONFIG } from "./pipeline-config.js";

// ── Types ─────────────────────────────────────────────────────────────────

export interface ConfigDisplay {
  key: string;
  value: string;
  source: "file" | "default" | "env";
}

// ── Constants ─────────────────────────────────────────────────────────────

const SECRET_PATTERNS = [/_secret$/i, /_token$/i, /^secret_/i, /^token_/i];

const BEGIN_MARKER = "<!-- BEGIN SPEQ -->";
const END_MARKER = "<!-- END SPEQ -->";

// Caveman pipeline keys that live in CLAUDE.md speq block
const CAVEMAN_KEYS = ["caveman.prd", "caveman.openspec", "caveman.beads"] as const;

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Recursively flatten a nested object into dotted key paths.
 * e.g. { steps: { implement: { model: "sonnet" } } }
 *   -> [{ key: "steps.implement.model", value: "sonnet" }]
 */
function flattenObject(
  obj: Record<string, unknown>,
  prefix = "",
): Array<{ key: string; value: string }> {
  const result: Array<{ key: string; value: string }> = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      result.push(...flattenObject(v as Record<string, unknown>, fullKey));
    } else {
      result.push({ key: fullKey, value: String(v) });
    }
  }
  return result;
}

/**
 * Set a value at a dotted path inside a (possibly nested) plain object,
 * creating intermediate objects as needed.
 */
function setByDottedPath(
  obj: Record<string, unknown>,
  dottedPath: string,
  value: unknown,
): void {
  const parts = dottedPath.split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part] || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1];
  if (value === "true") current[last] = true;
  else if (value === "false") current[last] = false;
  else current[last] = value;
}

/**
 * Get the leaf value at a dotted path in an object. Returns undefined if not found.
 */
function getByDottedPath(obj: Record<string, unknown>, dottedPath: string): unknown {
  const parts = dottedPath.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Determine whether a field name (leaf key, not dotted) matches a secret pattern.
 */
function isSecretFieldName(fieldName: string): boolean {
  return SECRET_PATTERNS.some((p) => p.test(fieldName));
}

/**
 * Read speq.config.yaml as a raw object, or return {} if it does not exist.
 */
function readYamlFile(projectDir: string): Record<string, unknown> {
  const yamlPath = join(projectDir, "speq.config.yaml");
  if (!existsSync(yamlPath)) return {};
  const content = readFileSync(yamlPath, "utf-8");
  const parsed = parseYaml(content);
  if (!parsed || typeof parsed !== "object") return {};
  return parsed as Record<string, unknown>;
}

/**
 * Write a plain object back to speq.config.yaml.
 */
function writeYamlFile(projectDir: string, data: Record<string, unknown>): void {
  const yamlPath = join(projectDir, "speq.config.yaml");
  writeFileSync(yamlPath, stringifyYaml(data), "utf-8");
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Display all current config settings with their resolved values and source.
 *
 * Source resolution:
 *  - "file"    if the key is present in speq.config.yaml
 *  - "env"     if the key is overridden by a SPEQ_* env var
 *  - "default" otherwise
 */
export function displayConfig(projectDir: string): ConfigDisplay[] {
  const fileRaw = readYamlFile(projectDir);
  const fileFlat = flattenObject(fileRaw);
  const fileKeys = new Set(fileFlat.map((e) => e.key));

  // Build env-key set: SPEQ_STEPS_IMPLEMENT_MODEL -> steps.implement.model (best-effort)
  const envKeys = new Set<string>();
  for (const [envKey] of Object.entries(process.env)) {
    if (envKey.startsWith("SPEQ_")) {
      const dottedPath = envKey.slice(5).toLowerCase().replace(/_/g, ".");
      envKeys.add(dottedPath);
    }
  }

  // Resolved config (includes env + file layers on top of defaults)
  const resolved = loadConfig(projectDir);
  const resolvedFlat = flattenObject(resolved as unknown as Record<string, unknown>);

  return resolvedFlat.map(({ key, value }) => {
    let source: "file" | "default" | "env" = "default";
    if (fileKeys.has(key)) source = "file";
    // Env override check: exact match or prefix match from env var translation
    if (envKeys.has(key)) source = "env";
    return { key, value, source };
  });
}

/**
 * Set a config value at the given dotted path in speq.config.yaml.
 *
 * Rejects any field whose leaf key matches a secret pattern.
 * Returns { ok: false } without writing if the value is unchanged.
 */
export function setConfigValue(
  projectDir: string,
  dottedPath: string,
  value: string,
): { ok: boolean; message: string } {
  // Reject secret field names (check the leaf key)
  const leafKey = dottedPath.split(".").at(-1) ?? dottedPath;
  if (isSecretFieldName(leafKey)) {
    return {
      ok: false,
      message: `"${dottedPath}" looks like a secret. Secrets must come from environment variables, not config files.`,
    };
  }

  // Load existing YAML (or empty object)
  const existing = readYamlFile(projectDir);

  // Check if the value is already set (idempotency)
  const currentValue = getByDottedPath(existing, dottedPath);
  const normalizedNew =
    value === "true" ? true : value === "false" ? false : value;
  if (currentValue !== undefined && currentValue === normalizedNew) {
    return {
      ok: true,
      message: `No change — ${dottedPath} is already set to "${value}".`,
    };
  }

  // Set the new value
  setByDottedPath(existing, dottedPath, value);
  writeYamlFile(projectDir, existing);

  return { ok: true, message: `Set ${dottedPath}: ${value}` };
}

/**
 * Migrate pipeline keys from CLAUDE.md's <!-- BEGIN SPEQ --> block into
 * speq.config.yaml.
 *
 * Maps:
 *   caveman.prd: on / caveman.openspec: on / caveman.beads: on
 *   -> pipeline.caveman: true  (all on)
 *   -> pipeline.caveman: false (any off, as a reasonable default)
 *
 * Removes the caveman.* lines from CLAUDE.md's speq block, preserving all
 * other content.
 *
 * Idempotent: if no pipeline keys are found in CLAUDE.md, returns gracefully.
 */
export function migrateConfig(
  projectDir: string,
): { ok: boolean; message: string; keysLifted: number } {
  const claudePath = join(projectDir, "CLAUDE.md");

  // P2: No CLAUDE.md
  if (!existsSync(claudePath)) {
    return {
      ok: true,
      message: "Nothing to migrate -- no CLAUDE.md found.",
      keysLifted: 0,
    };
  }

  const claudeContent = readFileSync(claudePath, "utf-8");
  const beginIdx = claudeContent.indexOf(BEGIN_MARKER);
  const endIdx = claudeContent.indexOf(END_MARKER);

  // P2: No speq block
  if (beginIdx === -1 || endIdx === -1 || endIdx <= beginIdx) {
    return {
      ok: true,
      message: "Nothing to migrate -- no speq block found in CLAUDE.md.",
      keysLifted: 0,
    };
  }

  // Extract the speq block (inclusive of markers)
  const blockStart = beginIdx;
  const blockEnd = endIdx + END_MARKER.length;
  const block = claudeContent.slice(blockStart, blockEnd);

  // Parse caveman keys from the block
  const prdMatch = block.match(/caveman\.prd:\s*(on|off)/);
  const openspecMatch = block.match(/caveman\.openspec:\s*(on|off)/);
  const beadsMatch = block.match(/caveman\.beads:\s*(on|off)/);

  const keysFound = [prdMatch, openspecMatch, beadsMatch].filter(Boolean).length;

  // Idempotent: nothing to lift
  if (keysFound === 0) {
    return {
      ok: true,
      message: "Nothing to migrate -- no pipeline keys found in speq block.",
      keysLifted: 0,
    };
  }

  // Determine pipeline.caveman value: true only if all present keys are "on"
  const prdOn = prdMatch ? prdMatch[1] === "on" : true;
  const openspecOn = openspecMatch ? openspecMatch[1] === "on" : true;
  const beadsOn = beadsMatch ? beadsMatch[1] === "on" : true;
  const cavemanEnabled = prdOn && openspecOn && beadsOn;

  // Write to speq.config.yaml
  const yamlData = readYamlFile(projectDir);
  const currentCaveman = getByDottedPath(
    yamlData as Record<string, unknown>,
    "pipeline.caveman",
  );
  if (currentCaveman !== cavemanEnabled) {
    setByDottedPath(yamlData as Record<string, unknown>, "pipeline.caveman", cavemanEnabled);
    writeYamlFile(projectDir, yamlData);
  }

  // Remove caveman.* lines from the speq block
  const cavemanLineRegex = /^[ \t]*caveman\.(prd|openspec|beads):[ \t]*(on|off)[ \t]*\r?\n?/gm;
  const newBlock = block.replace(cavemanLineRegex, "");

  // Rebuild CLAUDE.md
  const newClaudeContent =
    claudeContent.slice(0, blockStart) +
    newBlock +
    claudeContent.slice(blockEnd);

  writeFileSync(claudePath, newClaudeContent, "utf-8");

  return {
    ok: true,
    message: `Migrated ${keysFound} pipeline key(s) to speq.config.yaml.`,
    keysLifted: keysFound,
  };
}
