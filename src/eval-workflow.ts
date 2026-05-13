/**
 * eval-workflow.ts
 *
 * Manages eval fixtures and compares current outputs against golden outputs
 * to detect regressions in the speq /ship workflow.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface FixtureAddResult {
  ok: boolean;
  message: string;
  path?: string;
}

export interface EvalRunResult {
  fixture: string;
  status: "pass" | "regression" | "error";
  diff?: string;
  severity?: "low" | "medium" | "high";
}

export interface EvalSummary {
  timestamp: string;
  fixtures: EvalRunResult[];
  passed: number;
  failed: number;
  errors: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Directories that are always stripped when copying a fixture. */
const EXCLUDED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "target",
  ".next",
  "coverage",
]);

/** Regex patterns considered credential leaks inside a .env file. */
const CREDENTIAL_PATTERNS = [/API_KEY\s*=/i, /SECRET\s*=/i, /TOKEN\s*=/i];

/** Hard size limit for a fixture after exclusions: 1 MB */
const MAX_FIXTURE_BYTES = 1 * 1024 * 1024;

// ---------------------------------------------------------------------------
// getDirSize
// ---------------------------------------------------------------------------

/**
 * Recursively computes the total size of all files in a directory, in bytes.
 * Symlinks and special files are skipped.
 */
export function getDirSize(dirPath: string): number {
  let total = 0;
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const full = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += getDirSize(full);
    } else if (entry.isFile()) {
      total += statSync(full).size;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// addFixture
// ---------------------------------------------------------------------------

/**
 * Adds an eval fixture from a source directory into the speq fixtures store.
 *
 * Steps:
 *  1. Walk source dir and check for credential patterns in any .env file
 *     (before copying anything).
 *  2. Compute size after excluded directories.
 *  3. Enforce 1 MB limit.
 *  4. Copy source to .speq/evals/fixtures/<name>/, stripping excluded dirs.
 *     Existing destination is replaced (idempotent).
 *
 * @param speqDir   Absolute path to the .speq directory.
 * @param sourcePath  Absolute path to the fixture source.
 * @param name      Optional override for the fixture name (defaults to basename of sourcePath).
 */
export function addFixture(
  speqDir: string,
  sourcePath: string,
  name?: string,
): FixtureAddResult {
  if (!existsSync(sourcePath)) {
    return { ok: false, message: `Source path does not exist: ${sourcePath}` };
  }

  const fixtureName = name ?? basename(sourcePath);

  // --- Credential scan (walk source, skip excluded dirs) ---
  const credentialWarning = scanForCredentials(sourcePath);
  if (credentialWarning) {
    return { ok: false, message: credentialWarning };
  }

  // --- Size check (measure source minus excluded dirs via temp staging) ---
  const sizeAfterExclusions = measureSizeExcluding(sourcePath);
  if (sizeAfterExclusions > MAX_FIXTURE_BYTES) {
    const sizeMB = (sizeAfterExclusions / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      message: `Fixture exceeds 1MB limit (${sizeMB}MB after exclusions)`,
    };
  }

  // --- Copy into fixtures directory (replace if exists) ---
  const destPath = join(speqDir, "evals", "fixtures", fixtureName);
  if (existsSync(destPath)) {
    rmSync(destPath, { recursive: true, force: true });
  }
  mkdirSync(destPath, { recursive: true });

  copyExcluding(sourcePath, destPath);

  return {
    ok: true,
    message: `Fixture '${fixtureName}' added successfully.`,
    path: destPath,
  };
}

// ---------------------------------------------------------------------------
// runWorkflowEval
// ---------------------------------------------------------------------------

/**
 * Evaluates all fixtures in .speq/evals/fixtures/ by comparing current/
 * output against golden/ output. Does not actually replay /ship — it compares
 * whatever is in current/ vs golden/ so callers can inject pre-computed
 * outputs in tests.
 *
 * For each fixture:
 *  - If golden/ is absent → status "error"
 *  - If golden/ and current/ match → status "pass"
 *  - If they differ → status "regression", includes diff + severity
 *
 * Writes results to .speq/evals/runs/<ISO-timestamp>/:
 *  - <fixture-name>.json per fixture
 *  - summary.json aggregate
 *
 * @param speqDir  Absolute path to the .speq directory.
 */
export function runWorkflowEval(speqDir: string): EvalSummary {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fixturesDir = join(speqDir, "evals", "fixtures");
  const runDir = join(speqDir, "evals", "runs", timestamp);
  mkdirSync(runDir, { recursive: true });

  const results: EvalRunResult[] = [];

  if (!existsSync(fixturesDir)) {
    const summary = buildSummary(timestamp, results);
    writeRunResults(runDir, results, summary);
    return summary;
  }

  const fixtureNames = readdirSync(fixturesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  for (const fixtureName of fixtureNames) {
    const result = evalFixture(fixturesDir, fixtureName);
    results.push(result);
  }

  const summary = buildSummary(timestamp, results);
  writeRunResults(runDir, results, summary);
  return summary;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Scans a source directory for .env files that contain credential patterns.
 * Returns a warning message if credentials are found, or null if clean.
 * Skips excluded directories during the walk.
 */
function scanForCredentials(dirPath: string): string | null {
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      const nested = scanForCredentials(join(dirPath, entry.name));
      if (nested) return nested;
    } else if (entry.isFile() && entry.name === ".env") {
      const content = readFileSync(join(dirPath, entry.name), "utf-8");
      for (const pattern of CREDENTIAL_PATTERNS) {
        if (pattern.test(content)) {
          return (
            `Potential credentials detected in .env file (matched: ${pattern.source}). ` +
            "Remove the file or exclude it before adding this fixture."
          );
        }
      }
    }
  }
  return null;
}

/**
 * Computes the total size of a directory excluding the standard excluded dirs.
 * Uses a recursive walk rather than copying, so no temp files are created.
 */
function measureSizeExcluding(dirPath: string): number {
  let total = 0;
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      total += measureSizeExcluding(join(dirPath, entry.name));
    } else if (entry.isFile()) {
      total += statSync(join(dirPath, entry.name)).size;
    }
  }
  return total;
}

/**
 * Recursively copies files from src to dest, skipping excluded directories.
 */
function copyExcluding(src: string, dest: string): void {
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      const destSub = join(dest, entry.name);
      mkdirSync(destSub, { recursive: true });
      copyExcluding(join(src, entry.name), destSub);
    } else if (entry.isFile()) {
      cpSync(join(src, entry.name), join(dest, entry.name));
    }
  }
}

/**
 * Evaluates a single fixture by comparing its golden/ and current/ directories.
 */
function evalFixture(fixturesDir: string, fixtureName: string): EvalRunResult {
  const fixtureDir = join(fixturesDir, fixtureName);
  const goldenDir = join(fixtureDir, "golden");
  const currentDir = join(fixtureDir, "current");

  if (!existsSync(goldenDir)) {
    return {
      fixture: fixtureName,
      status: "error",
      diff: "Missing golden/ directory — no baseline to compare against.",
    };
  }

  if (!existsSync(currentDir)) {
    return {
      fixture: fixtureName,
      status: "error",
      diff: "Missing current/ directory — no output to evaluate.",
    };
  }

  const diff = computeDiff(goldenDir, currentDir);

  if (diff === "") {
    return { fixture: fixtureName, status: "pass" };
  }

  return {
    fixture: fixtureName,
    status: "regression",
    diff,
    severity: classifySeverity(diff),
  };
}

/**
 * Computes a line-level diff between all files in two directories.
 * Returns an empty string when the directories are identical.
 */
function computeDiff(goldenDir: string, currentDir: string): string {
  const diffs: string[] = [];

  const goldenFiles = collectFiles(goldenDir);
  const currentFiles = new Set(collectFiles(currentDir));

  for (const relFile of goldenFiles) {
    const goldenContent = readFileSync(join(goldenDir, relFile), "utf-8");
    const currentPath = join(currentDir, relFile);

    if (!existsSync(currentPath)) {
      diffs.push(`--- ${relFile} (missing in current)`);
      continue;
    }

    const currentContent = readFileSync(currentPath, "utf-8");
    if (goldenContent !== currentContent) {
      diffs.push(lineDiff(relFile, goldenContent, currentContent));
    }
    currentFiles.delete(relFile);
  }

  // Files present in current but not in golden.
  for (const relFile of currentFiles) {
    diffs.push(`+++ ${relFile} (new in current, not in golden)`);
  }

  return diffs.join("\n");
}

/**
 * Recursively collects relative file paths under a directory.
 */
function collectFiles(dir: string, prefix = ""): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      result.push(...collectFiles(join(dir, entry.name), rel));
    } else if (entry.isFile()) {
      result.push(rel);
    }
  }
  return result;
}

/**
 * Produces a simple unified-style line diff for a single file.
 */
function lineDiff(
  filename: string,
  goldenContent: string,
  currentContent: string,
): string {
  const goldenLines = goldenContent.split("\n");
  const currentLines = currentContent.split("\n");
  const lines: string[] = [`--- golden/${filename}`, `+++ current/${filename}`];

  const maxLen = Math.max(goldenLines.length, currentLines.length);
  for (let i = 0; i < maxLen; i++) {
    const g = goldenLines[i];
    const c = currentLines[i];
    if (g !== c) {
      if (g !== undefined) lines.push(`- ${g}`);
      if (c !== undefined) lines.push(`+ ${c}`);
    }
  }
  return lines.join("\n");
}

/**
 * Rates the severity of a diff based on its line count.
 *   low    → 1–5 changed lines
 *   medium → 6–20 changed lines
 *   high   → >20 changed lines
 */
function classifySeverity(diff: string): "low" | "medium" | "high" {
  const changedLines = diff
    .split("\n")
    .filter((l) => l.startsWith("- ") || l.startsWith("+ ")).length;

  if (changedLines <= 5) return "low";
  if (changedLines <= 20) return "medium";
  return "high";
}

/**
 * Aggregates EvalRunResult[] into an EvalSummary.
 */
function buildSummary(timestamp: string, results: EvalRunResult[]): EvalSummary {
  let passed = 0;
  let failed = 0;
  let errors = 0;
  for (const r of results) {
    if (r.status === "pass") passed++;
    else if (r.status === "regression") failed++;
    else errors++;
  }
  return { timestamp, fixtures: results, passed, failed, errors };
}

/**
 * Writes per-fixture JSON files and summary.json into the run directory.
 */
function writeRunResults(
  runDir: string,
  results: EvalRunResult[],
  summary: EvalSummary,
): void {
  for (const result of results) {
    writeFileSync(
      join(runDir, `${result.fixture}.json`),
      JSON.stringify(result, null, 2),
    );
  }
  writeFileSync(join(runDir, "summary.json"), JSON.stringify(summary, null, 2));
}
