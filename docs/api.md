# speq CLI API Reference

## Commands

### `speq init`

Initialise speq in the current project.

- Copies all 8 command prompt files to `.claude/commands/`
- Amends `CLAUDE.md` with speq instructions using `<!-- BEGIN SPEQ -->` / `<!-- END SPEQ -->` markers
- Runs `bd init` if `.beads/` does not exist

**Exit codes:**
- `0` — success
- `1` — `bd` not found or `bd init` failed

### `speq config [key] [value]`

Get or set caveman mode settings. Settings are stored in the `<!-- BEGIN SPEQ -->` block of CLAUDE.md.

**Usage:**
- `speq config` — display all settings
- `speq config caveman.prd` — display a single setting
- `speq config caveman.prd off` — set a single setting
- `speq config caveman --all on` — set all settings at once

**Valid keys:** `caveman.prd`, `caveman.openspec`, `caveman.beads`
**Valid values:** `on`, `off`

**Exit codes:**
- `0` — success
- `1` — invalid key/value, CLAUDE.md missing, or speq block missing

### `speq requirements`

Gather requirements via a Working Backwards conversation grounded in the codebase. Delegates to `claude --prompt-file .claude/commands/requirements.md`.

### `speq enrich`

Ground an existing PRD in the codebase. Delegates to `claude --prompt-file .claude/commands/enrich.md`.

### `speq spec`

Convert a PRD into OpenSpec files. Delegates to `claude --prompt-file .claude/commands/spec.md`.

### `speq plan`

Create a Beads task graph from specs. Delegates to `claude --prompt-file .claude/commands/plan.md`.

### `speq implement`

Run the TDD implementation loop. Delegates to `claude --prompt-file .claude/commands/implement.md`.

### `speq verify`

Pre-ship gate check. Delegates to `claude --prompt-file .claude/commands/verify.md`.

### `speq done`

Close the feature cycle. Delegates to `claude --prompt-file .claude/commands/done.md`.

### `speq ship [--from=<phase>]`

Run the full pipeline: enrich -> spec -> plan -> implement -> verify -> done.

**Options:**
- `--from=<phase>` — Skip phases before the specified phase. Valid phases: `enrich`, `spec`, `plan`, `implement`, `verify`, `done`.

**Exit codes:**
- `0` — all phases completed successfully
- `1` — a phase failed. The CLI prints which phase failed and a resume command.

### `speq resume`

Detect the current pipeline state from project artifacts and resume from the appropriate phase.

**Detection logic:**
- No `prd-*.md` -> error (no PRD)
- No `openspec/specs/*/spec.md` -> resume from `spec`
- No `.beads/` or no tasks -> resume from `plan`
- Open `bd` tasks exist -> resume from `implement`
- All tasks closed -> resume from `verify`

### `speq --version`

Print the CLI version.

### `speq --help`

Print usage information for all commands.

## Programmatic API

### `run(args: string[]): RunResult`

Parse CLI arguments and execute the corresponding command.

```typescript
import { run } from "speq/cli";

const result = run(["--version"]);
// { exitCode: 0, stdout: "0.1.0", stderr: "" }
```

### `RunResult`

```typescript
interface RunResult {
  exitCode: number;  // 0 for success, 1 for errors
  stdout: string;    // Content for stdout
  stderr: string;    // Error messages for stderr
}
```

### `init(projectDir: string): { exitCode: number; messages: string[] }`

Run the full speq init sequence.

### `runCommand(command: string, args: string[]): Promise<number>`

Execute a command safely using `child_process.spawn` with `shell: false`.

### `detectState(projectDir: string): { phase: Phase; description: string } | { error: string }`

Detect the current pipeline state from project artifacts.

### `isValidPhase(phase: string): boolean`

Check if a phase name is valid.

### `getPhasesFrom(fromPhase: Phase): Phase[]`

Get phases to execute starting from a given phase.

### `readConfig(projectDir: string): CavemanConfig | null`

Read caveman mode settings from the speq block in CLAUDE.md.

### `writeConfig(projectDir: string, key: string, value: string): { ok: boolean; message: string }`

Write a caveman mode setting to the speq block in CLAUDE.md.

### `formatConfig(config: CavemanConfig): string`

Format all config settings for display.

### `CavemanConfig`

```typescript
interface CavemanConfig {
  prd: "on" | "off";
  openspec: "on" | "off";
  beads: "on" | "off";
}
```
