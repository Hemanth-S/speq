import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { PipelineConfig } from "./pipeline-config.js";

// ---------------------------------------------------------------------------
// Caveman marker constants
// ---------------------------------------------------------------------------

export const CAVEMAN_BEGIN = "<!-- BEGIN SPEQ:caveman -->";
export const CAVEMAN_END = "<!-- END SPEQ:caveman -->";

/**
 * The standard speq caveman instructions injected between the markers.
 * Keep in sync with the caveman mode documentation.
 */
const CAVEMAN_INSTRUCTIONS = `
# Caveman Mode — active

Write all output in compressed, token-efficient form:
- Spec files: drop prose, keep IDs, GIVEN/WHEN/THEN, table names, endpoint paths.
- Beads tasks: ≤30 chars. Format: "Test: <what>" or "Impl: <what>".
- Git commits: ≤50 chars subject, no body unless a breaking change.
- ADR: one-sentence context, one-sentence decision, bullets for consequences.
- No filler phrases ("In order to", "This ensures that", "Please note").

caveman.prd: on
caveman.openspec: on
caveman.beads: on
`.trim();

// ---------------------------------------------------------------------------
// Version string validation
// ---------------------------------------------------------------------------

/**
 * A valid version string matches /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/ — it must not
 * contain path separators or dotdot sequences.
 *
 * Examples of valid strings:  v1  v2  v1-alpha  v10_rc
 * Examples of invalid strings: ../../etc/passwd  v1/evil  .hidden
 */
const VERSION_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

function validateVersion(step: string, version: string): void {
  if (
    !VERSION_RE.test(version) ||
    version.includes("..") ||
    version.includes("/") ||
    version.includes("\\")
  ) {
    throw new Error(
      `Invalid version "${version}" for step "${step}": path traversal or invalid version characters detected.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Caveman CLAUDE.md reconciliation
// ---------------------------------------------------------------------------

/**
 * Inject or remove the caveman instruction block in CLAUDE.md.
 *
 * Rules:
 * - If caveman=true and block is absent  → append block.
 * - If caveman=true and block is present → replace block content (idempotent).
 * - If caveman=false and block is present → remove block entirely.
 * - If caveman=false and block is absent  → no-op.
 *
 * All other content (including BEADS markers) is preserved exactly.
 */
function reconcileCavemanMarker(projectDir: string, caveman: boolean): void {
  const claudePath = join(projectDir, "CLAUDE.md");
  const markerBlock = `${CAVEMAN_BEGIN}\n${CAVEMAN_INSTRUCTIONS}\n${CAVEMAN_END}`;

  // CLAUDE.md does not exist
  if (!existsSync(claudePath)) {
    if (caveman) {
      writeFileSync(claudePath, markerBlock + "\n", "utf-8");
    }
    // caveman=false + no file → nothing to do
    return;
  }

  const content = readFileSync(claudePath, "utf-8");
  const beginIdx = content.indexOf(CAVEMAN_BEGIN);
  const endIdx = content.indexOf(CAVEMAN_END);
  const hasBlock = beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx;

  if (caveman) {
    if (hasBlock) {
      // Replace existing block to ensure content is up-to-date
      const before = content.slice(0, beginIdx);
      const after = content.slice(endIdx + CAVEMAN_END.length);
      const newContent = before + markerBlock + after;
      if (newContent !== content) {
        writeFileSync(claudePath, newContent, "utf-8");
      }
    } else {
      // Append block
      const separator = content.endsWith("\n") ? "\n" : "\n\n";
      writeFileSync(claudePath, content + separator + markerBlock + "\n", "utf-8");
    }
  } else {
    if (hasBlock) {
      // Remove block — strip everything from BEGIN to END (inclusive), plus
      // a trailing newline immediately after END if one is present.
      const before = content.slice(0, beginIdx);
      let after = content.slice(endIdx + CAVEMAN_END.length);
      // Trim at most one leading newline left by the removal
      if (after.startsWith("\n")) {
        after = after.slice(1);
      }
      // Trim trailing whitespace-only added by the block at the insertion point
      const newContent = before.trimEnd() + (after.length > 0 ? "\n" + after : "\n");
      writeFileSync(claudePath, newContent, "utf-8");
    }
    // caveman=false + no block → no-op
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Materialize versioned prompt files into .claude/commands/ and reconcile the
 * caveman instruction marker in CLAUDE.md.
 *
 * Algorithm (fail-fast, atomic-ish):
 * 1. Validate all version strings (P0 security gate).
 * 2. Read all source prompt files into memory — surface clear errors for missing files.
 * 3. Write all prompt files to .claude/commands/.
 * 4. Reconcile caveman marker in CLAUDE.md.
 *
 * @param projectDir - Absolute path to the project root.
 * @param config     - Loaded pipeline configuration.
 */
export function syncPrompts(projectDir: string, config: PipelineConfig): void {
  // Step 1 & 2: validate versions and read all source content up-front so that
  // we fail atomically before writing anything.
  const writes: Array<{ dest: string; content: string }> = [];

  for (const [step, stepConfig] of Object.entries(config.steps)) {
    const version = stepConfig.prompt_version;

    // P0: reject any version string that could escape the prompts/ directory
    validateVersion(step, version);

    const srcPath = join(projectDir, "prompts", step, `${version}.md`);
    if (!existsSync(srcPath)) {
      throw new Error(
        `Missing prompt file prompts/${step}/${version}.md — ` +
          `ensure the file exists before running syncPrompts.`,
      );
    }

    const content = readFileSync(srcPath, "utf-8");
    const destPath = join(projectDir, ".claude", "commands", `${step}.md`);
    writes.push({ dest: destPath, content });
  }

  // Step 3: all reads succeeded — now write outputs
  const commandsDir = join(projectDir, ".claude", "commands");
  mkdirSync(commandsDir, { recursive: true });

  for (const { dest, content } of writes) {
    writeFileSync(dest, content, "utf-8");
  }

  // Step 4: caveman marker reconciliation
  reconcileCavemanMarker(projectDir, config.pipeline.caveman);
}
