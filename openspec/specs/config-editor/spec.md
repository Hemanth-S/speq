# config-editor Spec

## Purpose
Provide an interactive config editor (`/project:config`) and a migration command (`/project:config migrate`) to lift pipeline keys from CLAUDE.md into speq.config.yaml.

## Refs
- Tables: none (file-based)
- APIs: none (CLI subcommand + slash command shim)
- Reuses: `src/config.ts` (config read/write), config-loading capability (schema validation)
- New: `.claude/commands/project-config.md` (thin markdown shim), `speq config` CLI handler (TS), `/project:config migrate` subcommand

## Requirements

### Req: Interactive Config Display and Edit
SHALL display current settings and validate edits against the schema before writing.

#### P1: Display current config
- GIVEN: a valid `speq.config.yaml` with `steps.implement.model: sonnet`
- WHEN: `/project:config` is invoked (or `speq config` with no args)
- THEN: output includes all current settings with their values and source (file/default/env)

#### P1: Valid edit accepted
- GIVEN: `/project:config` is active
- WHEN: user sets `steps.implement.model` to `haiku`
- THEN: `speq.config.yaml` is updated with the new value, schema validation passes, confirmation message displayed

#### P0: Secret value rejected on edit
- GIVEN: `/project:config` is active
- WHEN: user attempts to set `steps.implement.api_token` to `sk-test`
- THEN: edit is rejected with a message about secrets belonging in env vars, `speq.config.yaml` unchanged

#### P1: Idempotent write
- GIVEN: `speq.config.yaml` has `steps.implement.model: sonnet`
- WHEN: user sets `steps.implement.model` to `sonnet` (same value)
- THEN: `speq.config.yaml` content is unchanged (no spurious diff)

### Req: Config Migration
SHALL lift pipeline-shaped keys from CLAUDE.md's `<!-- BEGIN SPEQ -->` block into `speq.config.yaml`.

#### P1: Pipeline keys migrated
- GIVEN: CLAUDE.md contains `<!-- BEGIN SPEQ -->` block with `caveman.prd: on`, `caveman.openspec: off`, `caveman.beads: on`
- WHEN: `speq config migrate` (or `/project:config migrate`) runs
- THEN: `speq.config.yaml` contains `pipeline.caveman: true` (or appropriate mapped values), pipeline keys removed from CLAUDE.md's speq block, non-pipeline content in CLAUDE.md preserved

#### P1: Idempotent migration
- GIVEN: migration was already run (no pipeline keys remain in CLAUDE.md, `speq.config.yaml` is current)
- WHEN: `speq config migrate` is run again
- THEN: both files are unchanged, no error

#### P2: No CLAUDE.md graceful handling
- GIVEN: project has no CLAUDE.md
- WHEN: `speq config migrate` is run
- THEN: outputs "Nothing to migrate -- no CLAUDE.md found", exits with code 0

#### P2: Missing speq block graceful handling
- GIVEN: CLAUDE.md exists but has no `<!-- BEGIN SPEQ -->` block
- WHEN: `speq config migrate` is run
- THEN: outputs "Nothing to migrate -- no speq block found in CLAUDE.md", exits with code 0
