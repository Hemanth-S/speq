import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BEGIN_MARKER = "<!-- BEGIN SPEQ -->";
const END_MARKER = "<!-- END SPEQ -->";

export type CavemanValue = "on" | "off";

export interface CavemanConfig {
  prd: CavemanValue;
  openspec: CavemanValue;
  beads: CavemanValue;
}

export const DEFAULT_CONFIG: CavemanConfig = {
  prd: "on",
  openspec: "on",
  beads: "on",
};

const VALID_KEYS = ["caveman.prd", "caveman.openspec", "caveman.beads"] as const;
type CavemanKey = (typeof VALID_KEYS)[number];

function isValidKey(key: string): key is CavemanKey {
  return (VALID_KEYS as readonly string[]).includes(key);
}

function isValidValue(value: string): value is CavemanValue {
  return value === "on" || value === "off";
}

function keyToField(key: CavemanKey): keyof CavemanConfig {
  return key.split(".")[1] as keyof CavemanConfig;
}

/**
 * Read caveman config from the speq block in CLAUDE.md.
 * @param projectDir - Project root directory.
 * @returns Config object, or null if CLAUDE.md or speq block is missing.
 */
export function readConfig(projectDir: string): CavemanConfig | null {
  const claudePath = join(projectDir, "CLAUDE.md");
  if (!existsSync(claudePath)) {
    return null;
  }

  const content = readFileSync(claudePath, "utf-8");
  const beginIdx = content.indexOf(BEGIN_MARKER);
  const endIdx = content.indexOf(END_MARKER);

  if (beginIdx === -1 || endIdx === -1 || endIdx <= beginIdx) {
    return null;
  }

  const block = content.slice(beginIdx, endIdx);

  const config: CavemanConfig = { ...DEFAULT_CONFIG };

  const prdMatch = block.match(/caveman\.prd:\s*(on|off)/);
  const openspecMatch = block.match(/caveman\.openspec:\s*(on|off)/);
  const beadsMatch = block.match(/caveman\.beads:\s*(on|off)/);

  if (prdMatch) config.prd = prdMatch[1] as CavemanValue;
  if (openspecMatch) config.openspec = openspecMatch[1] as CavemanValue;
  if (beadsMatch) config.beads = beadsMatch[1] as CavemanValue;

  return config;
}

/**
 * Write a caveman config setting to the speq block in CLAUDE.md.
 * @param projectDir - Project root directory.
 * @param key - Setting key (e.g. "caveman.prd").
 * @param value - Setting value ("on" or "off").
 * @returns Result with ok status and message.
 */
export function writeConfig(
  projectDir: string,
  key: string,
  value: string,
): { ok: boolean; message: string } {
  if (!isValidKey(key)) {
    return {
      ok: false,
      message: `Unknown setting: ${key}. Valid: ${VALID_KEYS.join(", ")}`,
    };
  }

  if (!isValidValue(value)) {
    return {
      ok: false,
      message: `Invalid value: ${value}. Use on or off`,
    };
  }

  const claudePath = join(projectDir, "CLAUDE.md");
  if (!existsSync(claudePath)) {
    return { ok: false, message: "CLAUDE.md not found. Run `speq init` first." };
  }

  const content = readFileSync(claudePath, "utf-8");
  const beginIdx = content.indexOf(BEGIN_MARKER);
  const endIdx = content.indexOf(END_MARKER);

  if (beginIdx === -1 || endIdx === -1 || endIdx <= beginIdx) {
    return { ok: false, message: "Speq block not found in CLAUDE.md. Run `speq init`." };
  }

  const field = keyToField(key);
  const block = content.slice(beginIdx, endIdx + END_MARKER.length);
  const regex = new RegExp(`(caveman\\.${field}:\\s*)(on|off)`);

  let newBlock: string;
  if (regex.test(block)) {
    newBlock = block.replace(regex, `$1${value}`);
  } else {
    // Config line missing — add it before END_MARKER
    const insertPoint = block.indexOf(END_MARKER);
    newBlock =
      block.slice(0, insertPoint) +
      `caveman.${field}: ${value}\n` +
      block.slice(insertPoint);
  }

  const newContent = content.slice(0, beginIdx) + newBlock + content.slice(endIdx + END_MARKER.length);
  writeFileSync(claudePath, newContent, "utf-8");

  return { ok: true, message: `Set ${key}: ${value}` };
}

/**
 * Get the list of valid caveman config keys.
 */
export function getValidKeys(): readonly string[] {
  return VALID_KEYS;
}

/**
 * Format all config settings for display.
 * @param config - The config to format.
 * @returns Multi-line string showing all settings.
 */
export function formatConfig(config: CavemanConfig): string {
  return [
    `caveman.prd: ${config.prd}`,
    `caveman.openspec: ${config.openspec}`,
    `caveman.beads: ${config.beads}`,
  ].join("\n");
}
