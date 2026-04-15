import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const VALID_PHASES = ["enrich", "spec", "plan", "implement", "verify", "done"] as const;
export type Phase = (typeof VALID_PHASES)[number];

/**
 * Check if a phase name is valid.
 * @param phase - The phase name to validate.
 * @returns true if the phase is one of: enrich, spec, plan, implement, verify, done.
 */
export function isValidPhase(phase: string): phase is Phase {
  return (VALID_PHASES as readonly string[]).includes(phase);
}

/**
 * Get the list of valid phase names.
 */
export function getValidPhases(): readonly string[] {
  return VALID_PHASES;
}

/**
 * Get the phases to execute starting from a given phase.
 * @param fromPhase - The phase to start from.
 * @returns Ordered array of phases from the starting phase to the end.
 */
export function getPhasesFrom(fromPhase: Phase): Phase[] {
  const startIdx = VALID_PHASES.indexOf(fromPhase);
  return [...VALID_PHASES.slice(startIdx)];
}

/**
 * Detect the current pipeline state by inspecting project artifacts.
 * @param projectDir - The root directory of the project.
 * @returns The phase to resume from and a human-readable state description.
 */
export function detectState(projectDir: string): { phase: Phase; description: string } | { error: string } {
  // Check for PRD
  const hasPrd = readdirSync(projectDir).some(
    (f: string) => f.match(/^prd-.*\.md$/) || f === "PRD.md",
  );

  if (!hasPrd) {
    return {
      error:
        "No PRD found. Run `speq requirements` to create one, or place a prd-*.md file in the project root.",
    };
  }

  // Check for specs
  const specsDir = join(projectDir, "openspec", "specs");
  const hasSpecs =
    existsSync(specsDir) &&
    readdirSync(specsDir).some((d: string) => {
      const specFile = join(specsDir, d, "spec.md");
      return existsSync(specFile);
    });

  if (!hasSpecs) {
    return { phase: "spec", description: "PRD exists, no specs" };
  }

  // Check for bd tasks
  const hasBeads = existsSync(join(projectDir, ".beads"));
  if (!hasBeads) {
    return { phase: "plan", description: "specs exist, Beads not initialised" };
  }

  // Check for open tasks
  const bdResult = spawnSync("bd", ["list", "--status", "open", "--limit", "1"], {
    cwd: projectDir,
    shell: false,
    encoding: "utf-8",
    stdio: "pipe",
  });

  const hasOpenTasks =
    bdResult.status === 0 && bdResult.stdout.includes("open");

  if (hasOpenTasks) {
    return { phase: "implement", description: "open tasks found" };
  }

  // All tasks closed — need verify
  return { phase: "verify", description: "all tasks closed, verify not yet run" };
}
