# pipeline-resume Specification

## Purpose
Detect which phase of the speq pipeline failed and allow re-entry
from the failed phase via `speq ship --from=<phase>` or automatic
detection via `speq resume`.

## Codebase references
- Tables/collections: none
- APIs called or extended: `claude --prompt-file` (via command-runner), `bd list --status open` (Beads CLI)
- Services/modules reused:
  - `.claude/commands/ship.md` — contains the multi-phase pipeline
  - `.claude/commands/*.md` — individual phase prompts for `--from` resumption
  - `prd-*.md` — PRD files (artifact for state detection)
  - `openspec/specs/*/spec.md` — spec files (artifact for state detection)
- New schema required: none

## Requirements

### Requirement: Ship From Phase
The system SHALL allow skipping completed phases when resuming a pipeline run.

#### Scenario: Resume from implement phase [P1]
- GIVEN a project with `prd-*.md` and `openspec/specs/*/spec.md` files present
- AND   `bd list --status open` returns open tasks
- WHEN  the user runs `speq ship --from=implement`
- THEN  the CLI invokes `claude --prompt-file .claude/commands/implement.md`
- AND   does not run the enrich, spec, or plan phases

#### Scenario: Resume from verify phase [P1]
- GIVEN a project where all bd tasks are closed
- WHEN  the user runs `speq ship --from=verify`
- THEN  the CLI invokes `claude --prompt-file .claude/commands/verify.md`
- AND   does not run enrich, spec, plan, or implement phases

#### Scenario: Invalid phase name [P0]
- GIVEN the CLI is installed
- WHEN  the user runs `speq ship --from=nonexistent`
- THEN  the CLI prints "Unknown phase: nonexistent. Valid phases: enrich, spec, plan, implement, verify, done"
- AND   exits with code 1
- AND   does not expose stack traces

#### Scenario: From flag idempotency [P1]
- GIVEN a project in a valid state for the `verify` phase
- WHEN  the user runs `speq ship --from=verify` twice
- THEN  both runs invoke the verify phase without error
- AND   the second run produces the same result as the first

### Requirement: Automatic Phase Detection
`speq resume` SHALL detect the current pipeline state from project
artifacts and resume from the appropriate phase.

#### Scenario: No specs exist yet [P1]
- GIVEN a project with `prd-*.md` present
- AND   no `openspec/specs/*/spec.md` files exist
- WHEN  the user runs `speq resume`
- THEN  the CLI prints "Detected state: PRD exists, no specs. Resuming from: spec"
- AND   invokes the spec phase followed by remaining phases

#### Scenario: Specs exist but no bd tasks [P1]
- GIVEN a project with `prd-*.md` and `openspec/specs/*/spec.md` present
- AND   `bd list --status open` returns no tasks (either never created or all empty)
- AND   `.beads/` directory exists
- WHEN  the user runs `speq resume`
- THEN  the CLI prints "Detected state: specs exist, no open tasks. Resuming from: plan"
- AND   invokes the plan phase followed by remaining phases

#### Scenario: Open tasks exist [P1]
- GIVEN a project with `prd-*.md`, `openspec/specs/*/spec.md`, and open bd tasks
- WHEN  the user runs `speq resume`
- THEN  the CLI prints "Detected state: open tasks found. Resuming from: implement"
- AND   invokes the implement phase followed by remaining phases

#### Scenario: No PRD found [P2]
- GIVEN a project with no `prd-*.md` or `PRD.md` file
- WHEN  the user runs `speq resume`
- THEN  the CLI prints "No PRD found. Run `speq requirements` to create one, or place a prd-*.md file in the project root."
- AND   exits with code 1

### Requirement: Failed Phase Detection
When a pipeline command fails, the CLI SHALL detect the phase and suggest
a resume command.

#### Scenario: Claude exits with non-zero during ship [P1]
- GIVEN the user runs `speq ship`
- AND   the `claude` process exits with a non-zero exit code
- WHEN  the CLI detects the failure
- THEN  the CLI prints "Pipeline failed. To resume: speq resume"
- AND   exits with the same exit code as the `claude` process

#### Scenario: Ship from with failure detection [P2]
- GIVEN the user runs `speq ship --from=implement`
- AND   the `claude` process exits with a non-zero exit code
- WHEN  the CLI detects the failure
- THEN  the CLI prints "Pipeline failed at phase: implement. To resume: speq ship --from=implement"
- AND   exits with the same exit code as the `claude` process
