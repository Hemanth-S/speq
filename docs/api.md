# speq CLI API Reference

## Commands

### `speq init`

Initialise speq in the current project.

- Writes a default `speq.config.yaml` (if absent)
- Runs `sync-prompts` to materialize versioned prompts into `.claude/commands/`
- Reconciles caveman mode markers in `CLAUDE.md`
- Amends `CLAUDE.md` with speq instructions using `<!-- BEGIN SPEQ -->` / `<!-- END SPEQ -->` markers
- Runs `bd init` if `.beads/` does not exist

**Exit codes:**
- `0` — success
- `1` — `bd` not found or `bd init` failed

### `speq config [key] [value]`

Get or set pipeline settings. Settings are stored in `speq.config.yaml`.

**Usage:**
- `speq config` — display all settings with their source (file/default/env)
- `speq config steps.implement.model` — display a single setting
- `speq config steps.implement.model haiku` — set a single setting
- `speq config caveman --all on` — set all caveman settings at once (legacy)

Config rejects field names matching `*_secret` or `*_token` — secrets must come from environment variables.

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

### `speq config migrate`

Migrate pipeline keys from `CLAUDE.md`'s `<!-- BEGIN SPEQ -->` block into `speq.config.yaml`. Idempotent.

### `speq sync-prompts`

Materialize prompt files from `prompts/<step>/v*.md` into `.claude/commands/` based on `speq.config.yaml` versions. Also reconciles caveman mode markers in `CLAUDE.md`. Run automatically by `speq init` and `speq ship`.

### `speq adr add --title "<title>"`

Create a new draft ADR in `docs/adr/` (or configured path). Auto-numbered sequentially.

### `speq adr list`

List all ADRs with id, status, and title.

### `speq adr supersede <id> --title "<title>"`

Retire an active ADR and create its successor.

### `speq eval fixture add <path>`

Copy a fixture directory into `.speq/evals/fixtures/`, excluding `.git`, `node_modules`, etc. Rejects fixtures >1MB or containing credentials.

### `speq board`

Render the sprint board — pipeline state, Beads issues, config, and cost data — to `.speq/board.html`. The file is self-contained (inlined CSS, no external resources) and safe to open offline.

**Reads:** `speq.config.yaml`, `.speq/runs/*/summary.json`, `bd list --json` output.
**Writes:** `.speq/board.html`.

**Exit codes:**
- `0` — board rendered successfully
- `1` — render failed (e.g. `.speq/` is not writable). One-line error in stderr; no stack traces.

Re-run after a pipeline step completes or after editing `speq.config.yaml` to refresh.

---

## Configuration

### `speq.config.yaml`

Pipeline configuration file at the project root. Precedence: CLI flags > env vars > YAML > shipped defaults.

```yaml
pipeline:
  caveman: true

steps:
  requirements: { model: haiku, prompt_version: v1 }
  enrich: { model: haiku, prompt_version: v1 }
  spec: { model: haiku, prompt_version: v1 }
  plan: { model: sonnet, prompt_version: v1 }
  implement: { model: sonnet, prompt_version: v1, impl: sequential }
  verify: { model: sonnet, prompt_version: v1 }
  done: { model: haiku, prompt_version: v1 }

adr:
  path: docs/adr

evals:
  fixtures_path: .speq/evals/fixtures
```

### `models.yaml`

Shipped model card mapping shorthands to snapshot IDs and runners.

```yaml
models:
  haiku: { snapshot: claude-haiku-4-5-20251001, runner: claude }
  sonnet: { snapshot: claude-sonnet-4-7, runner: claude }
  opus: { snapshot: claude-opus-4-6, runner: claude }
  gpt-4o-mini: { runner: codex }
```

---

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

### Pipeline Config (`src/pipeline-config.ts`)

#### `loadConfig(projectDir, options?): PipelineConfig`
Load and merge config from 4 levels. Rejects secret field names and invalid YAML.

#### `PipelineConfig`
```typescript
interface PipelineConfig {
  pipeline: { caveman: boolean };
  steps: Record<string, StepConfig>;
  adr: { path: string };
  evals: { fixtures_path: string };
}
```

### Model Routing (`src/runners/`)

#### `resolveModel(modelName, modelsYamlPath?): { snapshot: string; runner: string }`
Resolve shorthand or exact model ID to snapshot + runner tag.

#### `Runner` interface
```typescript
interface Runner {
  name: string;
  supports(model: string): boolean;
  exec(prompt: string, model: string, opts: RunnerOpts): Promise<RunnerResult>;
}
```

Shipped implementations: `ClaudeRunner`, `CodexRunner`. Both enforce `shell: false`.

### Cost Telemetry (`src/telemetry.ts`)

#### `writeStepRecord(speqDir, runId, record): void`
Write per-step metadata to `.speq/runs/<run-id>/<step>.json`. No prompt/output content.

#### `computeRunSummary(speqDir, runId): RunSummary`
Aggregate step records into a run summary.

### ADR Management (`src/adr.ts`)

#### `addAdr(projectDir, title, adrPath?): { id: number; path: string }`
#### `listAdrs(projectDir, adrPath?): AdrEntry[]`
#### `supersedeAdr(projectDir, id, title, adrPath?): { oldPath: string; newPath: string }`

### Sprint Board (`src/board.ts`)

#### `writeBoard(projectDir): void`
Render pipeline state, Beads issues, config, and cost data to `.speq/board.html`.

### CLI Dispatcher (`src/cli.ts`)

#### `run(args, opts?): RunResult`
Parse CLI arguments and execute the corresponding command. `opts.cwd` overrides the working directory for commands that touch project files (currently `board`); defaults to `process.cwd()`.

#### `runBoard(cwd): RunResult`
Render the sprint board for the given project directory. Returns `{ exitCode: 0, stdout, stderr: "" }` on success with the relative path to `board.html` in `stdout`. Errors are caught and converted to `{ exitCode: 1, stderr }` with a one-line message — no stack traces leak.
