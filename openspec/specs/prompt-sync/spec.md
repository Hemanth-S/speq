# prompt-sync Spec

## Purpose
Materialize prompt files from versioned directories into `.claude/commands/` and reconcile caveman-mode instruction markers in CLAUDE.md.

## Refs
- Tables: none (file-based)
- APIs: none (library module + CLI subcommand)
- Reuses: `src/init.ts` (`amendClaudeMd()` extended for caveman markers), `src/config.ts` (reads `pipeline.caveman` from loaded config)
- New: `prompts/<step>/v*.md` (versioned prompt directory), `speq sync-prompts` CLI subcommand, `<!-- BEGIN SPEQ:caveman -->` / `<!-- END SPEQ:caveman -->` markers in CLAUDE.md

## Requirements

### Req: Prompt Materialization
SHALL copy the configured prompt version for each step into `.claude/commands/<step>.md`.

#### P1: Configured version materialized
- GIVEN: `speq.config.yaml` has `steps.spec.prompt_version: v2` and `prompts/spec/v2.md` exists
- WHEN: `syncPrompts(projectDir, config)` is called
- THEN: `.claude/commands/spec.md` contains the exact content of `prompts/spec/v2.md`

#### P1: Default version when not configured
- GIVEN: `speq.config.yaml` has no `steps.plan.prompt_version` entry and `prompts/plan/v1.md` exists
- WHEN: `syncPrompts(projectDir, config)` is called
- THEN: `.claude/commands/plan.md` contains the exact content of `prompts/plan/v1.md`

#### P0: Path traversal rejected
- GIVEN: `speq.config.yaml` has `steps.spec.prompt_version: ../../etc/passwd`
- WHEN: `syncPrompts(projectDir, config)` is called
- THEN: throws an error mentioning "path traversal" or "invalid version", does not read any file outside `prompts/`

#### P1: Idempotent sync
- GIVEN: `syncPrompts(projectDir, config)` was already called successfully
- WHEN: `syncPrompts(projectDir, config)` is called again with no config or prompt file changes
- THEN: `.claude/commands/` files are byte-identical to previous run

#### P2: Missing prompt version file
- GIVEN: `speq.config.yaml` has `steps.spec.prompt_version: v3` but `prompts/spec/v3.md` does not exist
- WHEN: `syncPrompts(projectDir, config)` is called
- THEN: throws a clear error naming the missing file `prompts/spec/v3.md`, does not partially materialize other steps

### Req: Caveman Marker Reconciliation
SHALL inject or remove the caveman instruction block in CLAUDE.md based on the `pipeline.caveman` config toggle.

#### P1: Caveman enabled injects marker
- GIVEN: `pipeline.caveman: true` in config and CLAUDE.md has no `<!-- BEGIN SPEQ:caveman -->` block
- WHEN: `syncPrompts(projectDir, config)` is called
- THEN: CLAUDE.md contains a `<!-- BEGIN SPEQ:caveman -->...<!-- END SPEQ:caveman -->` block with caveman instructions, all other CLAUDE.md content preserved

#### P1: Caveman disabled removes marker
- GIVEN: `pipeline.caveman: false` in config and CLAUDE.md contains a `<!-- BEGIN SPEQ:caveman -->` block
- WHEN: `syncPrompts(projectDir, config)` is called
- THEN: CLAUDE.md no longer contains the caveman block, all other CLAUDE.md content preserved

#### P1: Idempotent caveman toggle
- GIVEN: `pipeline.caveman: true` in config and CLAUDE.md already contains the correct caveman block
- WHEN: `syncPrompts(projectDir, config)` is called
- THEN: CLAUDE.md is unchanged (no unnecessary writes)

### Req: Init Integration
SHALL be callable from `speq init` as the final step, replacing static file copying.

#### P1: Init writes default config then syncs
- GIVEN: a project with no `speq.config.yaml` and no `.claude/commands/`
- WHEN: `speq init` runs
- THEN: `speq.config.yaml` is written with default values, `syncPrompts` runs, `.claude/commands/` contains materialized prompts from `prompts/<step>/v1.md`

#### P1: Performance within budget
- GIVEN: a project with 8 step prompts to materialize and caveman reconciliation to perform
- WHEN: `syncPrompts(projectDir, config)` is called and wall-clock time measured
- THEN: completes in <200ms
