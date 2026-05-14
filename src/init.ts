import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const BEGIN_MARKER = "<!-- BEGIN SPEQ -->";
const END_MARKER = "<!-- END SPEQ -->";

const SPEQ_INSTRUCTIONS = `
# speq — agent instructions

## Task tracking
Always use \`bd\` for all task tracking. Never mark a task done unless
its acceptance criteria are explicitly verified against the OpenSpec
scenario that generated it (see /implement, Step B-3).

## Workflow

| Command | When to use |
|---------|-------------|
| /requirements | Starting from scratch — gathers requirements interactively |
| /enrich | Have a PRD already — grounds it in the codebase |
| /spec | After PRD is ready — generates OpenSpec files |
| /plan | After specs exist — creates Beads task graph |
| /implement | Primary build loop — runs until all tasks closed |
| /verify | Before any merge or release |
| /done | After verify passes — closes the cycle |
| /ship | Single command — runs enrich → spec → plan → implement → verify → done |
| /board | Render the sprint board (pipeline state, Beads issues, config, cost) to .speq/board.html |

## Non-negotiable rules
1. Read the codebase before writing or refining any requirements.
2. No task is marked done without its GIVEN/WHEN/THEN verified against the spec.
3. No code is written before a failing test exists for it.
4. The implement command loops until \`bd list --status open\` is empty — do not stop early.
5. Documentation is written per scenario during implementation, not as a final step.
6. All user inputs must be validated before processing.
7. Secrets come from environment variables only — never hardcoded.
8. Error responses must not expose stack traces or internal paths to callers.

## Caveman Mode
caveman.prd: on
caveman.openspec: on
caveman.beads: on
`.trim();

/**
 * Get the path to speq's bundled command files.
 * When installed globally via npm, these are in the package's .claude/commands/ directory.
 */
function getCommandsSourceDir(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const packageRoot = join(dirname(thisFile), "..");
  return join(packageRoot, ".claude", "commands");
}

/**
 * Copy all speq command files into the target project's .claude/commands/ directory.
 * Overwrites existing command files but preserves non-speq files.
 * @param projectDir - The root directory of the target project.
 * @returns List of files copied.
 */
export function copyCommandFiles(projectDir: string): string[] {
  const sourceDir = getCommandsSourceDir();
  const targetDir = join(projectDir, ".claude", "commands");

  mkdirSync(targetDir, { recursive: true });

  if (!existsSync(sourceDir)) {
    return [];
  }

  const files = readdirSync(sourceDir).filter((f: string) => f.endsWith(".md"));
  for (const file of files) {
    copyFileSync(join(sourceDir, file), join(targetDir, file));
  }

  return files;
}

/**
 * Amend CLAUDE.md with speq instructions using idempotent markers.
 * - If CLAUDE.md doesn't exist, creates it with markers.
 * - If markers exist, replaces content between them.
 * - If no markers, appends at the end.
 * Preserves all other content including BEADS INTEGRATION markers.
 * @param projectDir - The root directory of the target project.
 */
export function amendClaudeMd(projectDir: string): void {
  const claudePath = join(projectDir, "CLAUDE.md");
  const markerBlock = `${BEGIN_MARKER}\n${SPEQ_INSTRUCTIONS}\n${END_MARKER}`;

  if (!existsSync(claudePath)) {
    writeFileSync(claudePath, markerBlock + "\n", "utf-8");
    return;
  }

  const content = readFileSync(claudePath, "utf-8");

  const beginIdx = content.indexOf(BEGIN_MARKER);
  const endIdx = content.indexOf(END_MARKER);

  if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
    // Replace content between markers
    const before = content.slice(0, beginIdx);
    const after = content.slice(endIdx + END_MARKER.length);
    writeFileSync(claudePath, before + markerBlock + after, "utf-8");
  } else {
    // Append at end
    const separator = content.endsWith("\n") ? "\n" : "\n\n";
    writeFileSync(claudePath, content + separator + markerBlock + "\n", "utf-8");
  }
}

/**
 * Initialise Beads (bd) in the project if not already present.
 * @param projectDir - The root directory of the target project.
 * @returns Object with success status and message.
 */
export function initBeads(projectDir: string): { ok: boolean; message: string } {
  // Check bd is available
  const which = spawnSync(process.platform === "win32" ? "where" : "which", ["bd"], {
    shell: false,
    encoding: "utf-8",
  });

  if (which.status !== 0) {
    return {
      ok: false,
      message:
        "Beads (bd) not found. Run the speq setup script or install manually: npm install -g @beads/bd",
    };
  }

  // Check if already initialised
  if (existsSync(join(projectDir, ".beads"))) {
    return { ok: true, message: "Beads already initialised, skipping" };
  }

  // Run bd init
  const result = spawnSync("bd", ["init"], {
    cwd: projectDir,
    shell: false,
    encoding: "utf-8",
    stdio: "pipe",
  });

  if (result.status !== 0) {
    const errorOutput = result.stderr || result.stdout || "Unknown error";
    return { ok: false, message: errorOutput };
  }

  return { ok: true, message: "Beads initialised successfully" };
}

/**
 * Run the full speq init sequence: copy commands, amend CLAUDE.md, init beads.
 * @param projectDir - The root directory of the target project.
 * @returns Object with success status, messages, and exit code.
 */
export function init(projectDir: string): { exitCode: number; messages: string[] } {
  const messages: string[] = [];

  // Step 1: Copy command files
  const files = copyCommandFiles(projectDir);
  if (files.length > 0) {
    messages.push(`Copied ${files.length} command files to .claude/commands/`);
  } else {
    messages.push("Warning: No command files found to copy");
  }

  // Step 2: Amend CLAUDE.md
  amendClaudeMd(projectDir);
  messages.push("Updated CLAUDE.md with speq instructions");

  // Step 3: Init Beads
  const beads = initBeads(projectDir);
  messages.push(beads.message);

  if (!beads.ok) {
    return { exitCode: 1, messages };
  }

  return { exitCode: 0, messages };
}
