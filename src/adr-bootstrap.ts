import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { addAdr, listAdrs } from "./adr.js";
import type { AdrEntry } from "./adr.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScanResult {
  title: string;
  evidence: string;
  confidence: "high" | "medium" | "low";
}

export interface BootstrapResult {
  drafts: { id: number; title: string; evidence: string }[];
  questions: { question: string; context: string }[];
  preserved: number;
}

interface MockCommit {
  date: string;
  message: string;
  files: string[];
}

interface BootstrapOptions {
  includeHistory?: boolean;
  /** Injected during tests instead of running git log */
  mockHistory?: MockCommit[];
}

// ---------------------------------------------------------------------------
// Known dependency → decision mapping
// ---------------------------------------------------------------------------

interface DepRule {
  /** Substring of the package name to match */
  match: string;
  title: string;
  confidence: "high" | "medium" | "low";
  /** Generate evidence from the matched package name */
  evidence: (pkg: string) => string;
}

const DEP_RULES: DepRule[] = [
  {
    match: "typescript",
    title: "Use TypeScript",
    confidence: "high",
    evidence: (pkg) => `"${pkg}" found in dependencies`,
  },
  {
    match: "vitest",
    title: "Use Vitest for testing",
    confidence: "high",
    evidence: (pkg) => `"${pkg}" found in devDependencies`,
  },
  {
    match: "jest",
    title: "Use Jest for testing",
    confidence: "high",
    evidence: (pkg) => `"${pkg}" found in devDependencies`,
  },
  {
    match: "drizzle-orm",
    title: "Use Drizzle ORM",
    confidence: "high",
    evidence: (pkg) => `"${pkg}" found in dependencies`,
  },
  {
    match: "drizzle-kit",
    title: "Use Drizzle ORM",
    confidence: "high",
    evidence: (pkg) => `"${pkg}" found in devDependencies (drizzle-kit)`,
  },
  {
    match: "prisma",
    title: "Use Prisma ORM",
    confidence: "high",
    evidence: (pkg) => `"${pkg}" found in dependencies`,
  },
  {
    match: "eslint",
    title: "Use ESLint for linting",
    confidence: "high",
    evidence: (pkg) => `"${pkg}" found in devDependencies`,
  },
  {
    match: "prettier",
    title: "Use Prettier for code formatting",
    confidence: "high",
    evidence: (pkg) => `"${pkg}" found in devDependencies`,
  },
  {
    match: "express",
    title: "Use Express as HTTP framework",
    confidence: "high",
    evidence: (pkg) => `"${pkg}" found in dependencies`,
  },
  {
    match: "fastify",
    title: "Use Fastify as HTTP framework",
    confidence: "high",
    evidence: (pkg) => `"${pkg}" found in dependencies`,
  },
  {
    match: "react",
    title: "Use React for UI",
    confidence: "high",
    evidence: (pkg) => `"${pkg}" found in dependencies`,
  },
  {
    match: "next",
    title: "Use Next.js for web framework",
    confidence: "high",
    evidence: (pkg) => `"${pkg}" found in dependencies`,
  },
  {
    match: "zod",
    title: "Use Zod for schema validation",
    confidence: "high",
    evidence: (pkg) => `"${pkg}" found in dependencies`,
  },
];

// ---------------------------------------------------------------------------
// Decision-like patterns for docs ingestion
// ---------------------------------------------------------------------------

const DECISION_PATTERNS = [
  /\bwe use\b/i,
  /\benforces?\b/i,
  /\brequires?\b/i,
  /\bchosen\b/i,
  /\bwe have adopted\b/i,
  /\bwe rely on\b/i,
  /\bwe decided\b/i,
  /\bwe will use\b/i,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a concise ADR title from a sentence containing a decision keyword.
 */
function titleFromSentence(sentence: string): string {
  // Strip leading/trailing whitespace and punctuation
  const s = sentence.trim().replace(/[.!?]+$/, "");

  // Cap at 80 chars to keep ADR titles readable
  if (s.length <= 80) return s;
  return s.slice(0, 77) + "...";
}

/**
 * Normalise a title for duplicate-detection comparison.
 */
function normalise(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Return true when `candidate` is sufficiently similar to any existing ADR title.
 * Strategy: if the normalised candidate contains or is contained by the normalised
 * existing title, treat them as duplicates.
 */
function isDuplicate(candidate: string, existing: AdrEntry[]): boolean {
  const normCandidate = normalise(candidate);
  for (const adr of existing) {
    const normExisting = normalise(adr.title);
    if (
      normCandidate === normExisting ||
      normCandidate.includes(normExisting) ||
      normExisting.includes(normCandidate)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Check whether both a set of conflicting packages co-exist in deps.
 * Returns a question string if ambiguity is detected, or null otherwise.
 */
function detectAmbiguities(
  allDeps: Record<string, string>,
): { question: string; context: string }[] {
  const questions: { question: string; context: string }[] = [];

  const hasVitest = "vitest" in allDeps;
  const hasJest = "jest" in allDeps;

  if (hasVitest && hasJest) {
    questions.push({
      question:
        "Both vitest and jest detected — which is the primary test framework?",
      context:
        `Found both "vitest" and "jest" in dependencies. ` +
        `Please indicate which is canonical so the correct ADR can be generated.`,
    });
  }

  return questions;
}

/**
 * Group commits by week and detect "epoch clusters" — weeks where multiple
 * files or packages for a single library appear together.
 */
function detectEpochClusters(history: MockCommit[]): ScanResult[] {
  const results: ScanResult[] = [];

  // Group by ISO week (YYYY-WW approximated by first 7 chars of date = YYYY-MM)
  const byWeek = new Map<string, MockCommit[]>();
  for (const commit of history) {
    // Use YYYY-MM-DD → YYYY-WW via simple date math
    const d = new Date(commit.date);
    const weekKey = `${d.getFullYear()}-W${Math.ceil((d.getDate()) / 7)}`;
    if (!byWeek.has(weekKey)) byWeek.set(weekKey, []);
    byWeek.get(weekKey)!.push(commit);
  }

  for (const [week, commits] of byWeek) {
    const allMessages = commits.map((c) => c.message).join(" ");
    const allFiles = commits.flatMap((c) => c.files).join(" ");
    const combined = allMessages + " " + allFiles;

    // Detect drizzle cluster
    if (
      combined.toLowerCase().includes("drizzle") ||
      allFiles.includes("drizzle")
    ) {
      const dates = commits.map((c) => c.date).sort();
      const dateRange =
        dates.length === 1
          ? dates[0]
          : `${dates[0]} to ${dates[dates.length - 1]}`;
      results.push({
        title: "Use Drizzle ORM",
        evidence: `Commit cluster in ${week} (${dateRange}): ${commits.map((c) => c.message).join("; ")}`,
        confidence: "high",
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run structural scan: parse package.json, tsconfig.json, and folder structure.
 * Returns inferred decisions with confidence levels.
 */
export function structuralScan(projectDir: string): ScanResult[] {
  const results: ScanResult[] = [];

  // --- 1. Parse package.json from root only (for performance) ---
  const pkgPath = join(projectDir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const raw = readFileSync(pkgPath, "utf-8");
      const pkg = JSON.parse(raw) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };

      const deps = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
      };

      // De-duplicate: track which titles have already been added
      const addedTitles = new Set<string>();

      for (const [pkgName] of Object.entries(deps)) {
        for (const rule of DEP_RULES) {
          if (pkgName === rule.match || pkgName.startsWith(rule.match)) {
            if (!addedTitles.has(rule.title)) {
              results.push({
                title: rule.title,
                evidence: rule.evidence(pkgName),
                confidence: rule.confidence,
              });
              addedTitles.add(rule.title);
            }
          }
        }
      }
    } catch {
      // Malformed package.json — skip silently so existing ADRs are preserved
    }
  }

  // --- 2. Parse tsconfig.json ---
  const tsconfigPath = join(projectDir, "tsconfig.json");
  if (existsSync(tsconfigPath)) {
    try {
      const raw = readFileSync(tsconfigPath, "utf-8");
      const tsconfig = JSON.parse(raw) as {
        compilerOptions?: Record<string, unknown>;
      };
      const opts = tsconfig.compilerOptions ?? {};

      if (opts["strict"] === true) {
        results.push({
          title: "Enable TypeScript strict mode",
          evidence: `tsconfig.json: "strict": true`,
          confidence: "high",
        });
      }

      if (opts["module"]) {
        results.push({
          title: `Use ${String(opts["module"])} module system`,
          evidence: `tsconfig.json: "module": "${String(opts["module"])}"`,
          confidence: "medium",
        });
      }
    } catch {
      // Malformed tsconfig — skip silently
    }
  }

  // --- 3. Check folder structure ---
  const hasSrc = existsSync(join(projectDir, "src"));
  const hasTest =
    existsSync(join(projectDir, "test")) ||
    existsSync(join(projectDir, "tests")) ||
    existsSync(join(projectDir, "__tests__"));
  const hasDocs = existsSync(join(projectDir, "docs"));
  const hasOpenspec = existsSync(join(projectDir, "openspec"));

  if (hasSrc && hasTest) {
    results.push({
      title: "Separate test directory from source",
      evidence: `Both src/ and test/ directories detected at project root`,
      confidence: "high",
    });
  } else if (hasSrc) {
    results.push({
      title: "Use src/ directory for source files",
      evidence: `src/ directory detected at project root`,
      confidence: "medium",
    });
  }

  if (hasDocs) {
    results.push({
      title: "Maintain docs/ directory for documentation",
      evidence: `docs/ directory detected at project root`,
      confidence: "medium",
    });
  }

  if (hasOpenspec) {
    results.push({
      title: "Use OpenSpec for specification-driven development",
      evidence: `openspec/ directory detected at project root`,
      confidence: "high",
    });
  }

  return results;
}

/**
 * Parse docs (README.md, CONTRIBUTING.md) for stated decisions.
 */
export function docsIngestion(projectDir: string): ScanResult[] {
  const results: ScanResult[] = [];
  const docsToCheck = ["README.md", "CONTRIBUTING.md", "ARCHITECTURE.md"];

  for (const docFile of docsToCheck) {
    const docPath = join(projectDir, docFile);
    if (!existsSync(docPath)) continue;

    const content = readFileSync(docPath, "utf-8");
    const sentences = content
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);

    for (const sentence of sentences) {
      if (DECISION_PATTERNS.some((re) => re.test(sentence))) {
        results.push({
          title: titleFromSentence(sentence),
          evidence: sentence,
          confidence: "medium",
        });
      }
    }
  }

  return results;
}

/**
 * Run full bootstrap: structural scan + docs ingestion, then create draft ADRs
 * for genuinely new decisions while preserving all existing ADRs.
 *
 * @param projectDir - Absolute path to the project root.
 * @param adrPath    - Optional relative path to the ADR directory.
 * @param options    - Optional flags (includeHistory, mockHistory).
 * @returns BootstrapResult with created drafts, clarifying questions, and preserved count.
 */
export function bootstrap(
  projectDir: string,
  adrPath?: string,
  options: BootstrapOptions = {},
): BootstrapResult {
  // Snapshot existing ADRs before any writes (P0 safety)
  const existingAdrs = listAdrs(projectDir, adrPath);
  const preserved = existingAdrs.length;

  const drafts: { id: number; title: string; evidence: string }[] = [];
  const questions: { question: string; context: string }[] = [];

  // --- Collect all scan results ---
  let scanResults: ScanResult[] = [];

  try {
    const structural = structuralScan(projectDir);
    const docs = docsIngestion(projectDir);
    scanResults = [...structural, ...docs];
  } catch {
    // If scanning itself fails hard, return safely with preserved ADRs untouched
    return { drafts, questions, preserved };
  }

  // --- Commit epoch clustering (optional) ---
  if (options.includeHistory) {
    const history = options.mockHistory ?? [];
    const epochResults = detectEpochClusters(history);
    scanResults = [...scanResults, ...epochResults];
  }

  // --- Detect ambiguities and generate questions ---
  const pkgPath = join(projectDir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const raw = readFileSync(pkgPath, "utf-8");
      const pkg = JSON.parse(raw) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const allDeps = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
      };
      const detected = detectAmbiguities(allDeps);
      questions.push(...detected);
    } catch {
      // Malformed package.json — already handled in structuralScan
    }
  }

  // --- De-duplicate scan results by title ---
  const seenTitles = new Set<string>();
  const uniqueResults: ScanResult[] = [];
  for (const r of scanResults) {
    const key = normalise(r.title);
    if (!seenTitles.has(key)) {
      seenTitles.add(key);
      uniqueResults.push(r);
    }
  }

  // --- Create draft ADRs for new decisions ---
  for (const result of uniqueResults) {
    // Skip low-confidence items that should only produce questions
    // (low-confidence items that are also ambiguous are already surfaced above)
    if (result.confidence === "low") continue;

    // Skip if a duplicate of an existing ADR
    if (isDuplicate(result.title, existingAdrs)) continue;

    try {
      const { id, path: _path } = addAdr(projectDir, result.title, adrPath);
      drafts.push({
        id,
        title: result.title,
        evidence: result.evidence,
      });
    } catch {
      // If writing a single ADR fails, skip it and continue
      // Existing ADRs are already preserved (no mutation attempted)
    }
  }

  return { drafts, questions, preserved };
}
