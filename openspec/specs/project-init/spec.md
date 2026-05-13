# project-init Specification

## Purpose
Initialise a project for speq usage by copying command prompt files,
amending CLAUDE.md with speq instructions using idempotent markers,
and initialising the Beads task tracker.

## Codebase references
- Tables/collections: none
- APIs called or extended: none
- Services/modules reused:
  - `.claude/commands/*.md` — 8 prompt files to copy (requirements, enrich, spec, plan, implement, verify, done, ship)
  - `CLAUDE.md` — agent instructions template with existing `<!-- BEGIN BEADS INTEGRATION -->` markers
  - `.claude/settings.json` — Claude Code hooks config
- New schema required: none

## Requirements

### Requirement: Copy Command Files
The system SHALL copy all 8 speq command prompt files into the target
project's `.claude/commands/` directory.

#### Scenario: Fresh project with no .claude directory [P1]
- GIVEN a project directory with no `.claude/` directory
- WHEN  the user runs `speq init`
- THEN  the CLI creates `.claude/commands/` in the project root
- AND   copies all 8 command files (requirements.md, enrich.md, spec.md, plan.md, implement.md, verify.md, done.md, ship.md) into it
- AND   each copied file is byte-identical to the source

#### Scenario: Existing .claude/commands with stale files [P1]
- GIVEN a project directory with `.claude/commands/` containing older versions of the command files
- WHEN  the user runs `speq init`
- THEN  the CLI overwrites all 8 command files with the current versions
- AND   does not delete any non-speq files already in `.claude/commands/`

#### Scenario: Init is idempotent [P1]
- GIVEN `speq init` has already been run in the project
- WHEN  the user runs `speq init` a second time
- THEN  the resulting `.claude/commands/` directory is identical to after the first run
- AND   CLAUDE.md contains exactly one `<!-- BEGIN SPEQ -->` / `<!-- END SPEQ -->` block
- AND   no content is duplicated

### Requirement: Amend CLAUDE.md
The system SHALL insert or update speq instructions in CLAUDE.md using
marker comments for idempotent updates.

#### Scenario: CLAUDE.md does not exist [P1]
- GIVEN a project directory with no `CLAUDE.md` file
- WHEN  the user runs `speq init`
- THEN  the CLI creates `CLAUDE.md` with the speq instructions block wrapped in `<!-- BEGIN SPEQ -->` / `<!-- END SPEQ -->` markers

#### Scenario: CLAUDE.md exists without speq markers [P1]
- GIVEN a project directory with an existing `CLAUDE.md` containing project-specific instructions and `<!-- BEGIN BEADS INTEGRATION -->` markers
- WHEN  the user runs `speq init`
- THEN  the CLI appends the speq instructions block at the end of the file, wrapped in `<!-- BEGIN SPEQ -->` / `<!-- END SPEQ -->` markers
- AND   all existing content (including Beads markers) is preserved unchanged

#### Scenario: CLAUDE.md exists with stale speq markers [P1]
- GIVEN a project directory with a `CLAUDE.md` containing `<!-- BEGIN SPEQ -->` / `<!-- END SPEQ -->` markers with outdated content between them
- WHEN  the user runs `speq init`
- THEN  the CLI replaces only the content between the markers with the current speq instructions
- AND   all content before `<!-- BEGIN SPEQ -->` is preserved unchanged
- AND   all content after `<!-- END SPEQ -->` is preserved unchanged

#### Scenario: Malicious content around markers [P0]
- GIVEN a `CLAUDE.md` file where content outside the speq markers contains strings that look like speq markers (e.g., `<!-- BEGIN SPEQ` without the closing `-->`)
- WHEN  the user runs `speq init`
- THEN  the CLI matches only the exact markers `<!-- BEGIN SPEQ -->` and `<!-- END SPEQ -->`
- AND   does not corrupt or remove any other content

### Requirement: Initialise Beads
The system SHALL initialise the Beads task tracker if not already present.

#### Scenario: Beads not yet initialised [P1]
- GIVEN a project directory with no `.beads/` directory
- AND   `bd` is available in PATH
- WHEN  the user runs `speq init`
- THEN  the CLI runs `bd init` in the project directory
- AND   a `.beads/` directory is created

#### Scenario: Beads already initialised [P1]
- GIVEN a project directory with an existing `.beads/` directory
- WHEN  the user runs `speq init`
- THEN  the CLI skips `bd init`
- AND   prints "Beads already initialised, skipping"

#### Scenario: bd not in PATH [P2]
- GIVEN `bd` is not available in PATH
- WHEN  the user runs `speq init`
- THEN  the CLI prints "Beads (bd) not found. Run the speq setup script or install manually: npm install -g @beads/bd"
- AND   exits with code 1
- AND   does not expose internal paths or stack traces

#### Scenario: bd init fails [P2]
- GIVEN `bd` is in PATH but `bd init` returns a non-zero exit code
- WHEN  the user runs `speq init`
- THEN  the CLI prints the error output from `bd init`
- AND   exits with code 1
