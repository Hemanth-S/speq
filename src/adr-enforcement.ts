import { readFileSync } from "node:fs";
import { listAdrs } from "./adr.js";
import type { AdrEntry } from "./adr.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdrViolation {
  adr_id: number;
  title: string;
  detail: string;
}

export interface AdrCheckResult {
  gate: "adr-compliance";
  status: "pass" | "fail";
  adrs_checked: number;
  violations: AdrViolation[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse the tags array from the frontmatter of an ADR file.
 * Returns an empty array if the file has no tags or they cannot be parsed.
 */
function parseAdrTags(filePath: string): string[] {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  const tagsMatch = content.match(/^tags:\s*\[([^\]]*)\]/m);
  if (!tagsMatch) return [];

  const raw = tagsMatch[1].trim();
  if (raw === "") return [];

  return raw.split(",").map((t) => t.trim().toLowerCase());
}

/**
 * Extract the text content of the ## Decision section from an ADR file.
 * Returns an empty string if the section cannot be found.
 */
function parseDecisionText(filePath: string): string {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }

  // Match everything between ## Decision and the next ## heading (or EOF)
  const decisionMatch = content.match(/## Decision\n([\s\S]*?)(?=\n## |\s*$)/);
  if (!decisionMatch) return "";

  return decisionMatch[1].trim();
}

/**
 * Tokenise a string into lowercase words for keyword matching.
 */
function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 0),
  );
}

/**
 * Return prohibited keywords extracted from a decision text.
 *
 * Strategy: collect every "interesting" word in the decision text that is not
 * a common stop-word.  This intentionally stays simple — the spec calls for
 * keyword matching, not NLP.
 */
const STOP_WORDS = new Set([
  "we", "will", "not", "use", "for", "any", "in", "the", "this",
  "of", "to", "a", "an", "and", "or", "is", "are", "be", "was",
  "all", "with", "at", "by", "from", "on", "that", "it", "its",
  "have", "has", "do", "does", "as", "but", "if", "so", "no",
  "project", "instead", "may", "final", "decided", "decision",
  "our", "their", "which", "when", "how", "what", "who",
  "approach", "subsystem", "system", "thing", "about", "design",
]);

function extractProhibitedTerms(decisionText: string): string[] {
  return Array.from(words(decisionText)).filter(
    (w) => w.length > 2 && !STOP_WORDS.has(w),
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Surface active ADRs that are relevant for a given context string.
 *
 * Relevance is determined by tag overlap: if any tag from the ADR appears as
 * a word in the context string, the ADR is surfaced.  Only ADRs with status
 * "active" are returned.
 *
 * @param projectDir - Absolute path to the project root.
 * @param context    - Free-form text describing the current feature/PRD context.
 * @param adrPath    - Optional relative path to the ADR directory.
 * @returns Array of relevant active AdrEntry objects.
 */
export function surfaceRelevantAdrs(
  projectDir: string,
  context: string,
  adrPath?: string,
): AdrEntry[] {
  const adrs = listAdrs(projectDir, adrPath);
  const contextWords = words(context);

  return adrs.filter((adr) => {
    if (adr.status !== "active") return false;

    const tags = parseAdrTags(adr.path);
    // Surface the ADR if any of its tags appears in the context
    return tags.some((tag) => contextWords.has(tag));
  });
}

/**
 * Check whether PRD text violates any active ADRs.
 *
 * For each active ADR, the Decision section is parsed for prohibited terms.
 * If the PRD text contains those terms, a violation is recorded.
 *
 * @param projectDir - Absolute path to the project root.
 * @param prdText    - The full PRD text to check.
 * @param adrPath    - Optional relative path to the ADR directory.
 * @returns Object with violations array and blocking flag.
 */
export function checkPrdViolations(
  projectDir: string,
  prdText: string,
  adrPath?: string,
): { violations: AdrViolation[]; blocking: boolean } {
  const adrs = listAdrs(projectDir, adrPath);
  const prdWords = words(prdText);
  const violations: AdrViolation[] = [];

  for (const adr of adrs) {
    if (adr.status !== "active") continue;

    const decisionText = parseDecisionText(adr.path);
    const prohibited = extractProhibitedTerms(decisionText);

    const matched = prohibited.filter((term) => prdWords.has(term));
    if (matched.length > 0) {
      violations.push({
        adr_id: adr.id,
        title: adr.title,
        detail: `ADR-${String(adr.id).padStart(4, "0")} prohibits: ${matched.join(", ")} — found in PRD`,
      });
    }
  }

  return {
    violations,
    blocking: violations.length > 0,
  };
}

/**
 * Verify gate: check a set of changed files against all active ADRs.
 *
 * For each active ADR, prohibited terms are extracted from its Decision
 * section.  If any changed file's content contains those terms, the gate
 * fails with a citation that includes both the ADR id and the offending file.
 *
 * @param projectDir   - Absolute path to the project root.
 * @param changedFiles - Array of {path, content} objects representing the diff.
 * @param adrPath      - Optional relative path to the ADR directory.
 * @returns AdrCheckResult with gate name, pass/fail status, count, violations.
 */
export function runAdrVerifyGate(
  projectDir: string,
  changedFiles: { path: string; content: string }[],
  adrPath?: string,
): AdrCheckResult {
  const adrs = listAdrs(projectDir, adrPath);
  const activeAdrs = adrs.filter((a) => a.status === "active");
  const violations: AdrViolation[] = [];

  for (const adr of activeAdrs) {
    const decisionText = parseDecisionText(adr.path);
    const prohibited = extractProhibitedTerms(decisionText);

    for (const file of changedFiles) {
      const fileWords = words(file.content);
      const matched = prohibited.filter((term) => fileWords.has(term));
      if (matched.length > 0) {
        violations.push({
          adr_id: adr.id,
          title: adr.title,
          detail: `ADR-${String(adr.id).padStart(4, "0")} violated: ${matched.join(", ")} — found in ${file.path}`,
        });
        // One violation per (ADR, file) pair — stop checking more files for this ADR
        break;
      }
    }
  }

  return {
    gate: "adr-compliance",
    status: violations.length === 0 ? "pass" : "fail",
    adrs_checked: activeAdrs.length,
    violations,
  };
}
