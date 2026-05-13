# config-cli Specification

## Purpose
Provide `speq config` CLI command to read/write caveman mode settings
stored in the CLAUDE.md speq block.

## Codebase references
- Services/modules reused:
  - `src/init.ts` — `amendClaudeMd()`, `BEGIN_MARKER`/`END_MARKER` constants
  - `src/cli.ts` — COMMANDS list, `run()` routing
  - `src/index.ts` — command dispatch

## Requirements

### Requirement: Config Storage
The system SHALL store caveman settings in the CLAUDE.md speq block
and provide read/write access via CLI.

#### Scenario: Display all settings [P1]
- GIVEN: CLAUDE.md exists with speq block containing caveman config
- WHEN: `speq config`
- THEN: prints all three settings with current values, exits 0

#### Scenario: Get single setting [P1]
- GIVEN: CLAUDE.md exists with speq block, caveman.prd is on
- WHEN: `speq config caveman.prd`
- THEN: prints "caveman.prd: on", exits 0

#### Scenario: Set single setting [P1]
- GIVEN: CLAUDE.md exists with speq block
- WHEN: `speq config caveman.openspec off`
- THEN: updates only caveman.openspec to off in speq block, preserves all other content, exits 0

#### Scenario: Set all settings at once [P1]
- GIVEN: CLAUDE.md exists with speq block
- WHEN: `speq config caveman --all on`
- THEN: sets caveman.prd, caveman.openspec, caveman.beads all to on, exits 0

#### Scenario: Invalid key rejected [P0]
- GIVEN: CLAUDE.md exists with speq block
- WHEN: `speq config caveman.invalid on`
- THEN: prints "Unknown setting: caveman.invalid. Valid: caveman.prd, caveman.openspec, caveman.beads", exits 1
- AND: does not modify CLAUDE.md

#### Scenario: Invalid value rejected [P0]
- GIVEN: CLAUDE.md exists with speq block
- WHEN: `speq config caveman.prd maybe`
- THEN: prints "Invalid value: maybe. Use on or off", exits 1
- AND: does not modify CLAUDE.md

#### Scenario: CLAUDE.md missing [P1]
- GIVEN: no CLAUDE.md in project directory
- WHEN: `speq config`
- THEN: prints "CLAUDE.md not found. Run `speq init` first.", exits 1

#### Scenario: Speq block missing from CLAUDE.md [P1]
- GIVEN: CLAUDE.md exists but has no `<!-- BEGIN SPEQ -->` marker
- WHEN: `speq config caveman.prd on`
- THEN: prints "Speq block not found in CLAUDE.md. Run `speq init`.", exits 1

### Requirement: Default Config on Init
`speq init` SHALL include default caveman settings in the speq block.

#### Scenario: Init creates default config [P1]
- GIVEN: fresh project with no CLAUDE.md
- WHEN: `speq init`
- THEN: CLAUDE.md speq block contains `caveman.prd: on`, `caveman.openspec: on`, `caveman.beads: on`

#### Scenario: Init preserves existing config [P1]
- GIVEN: CLAUDE.md with speq block where caveman.prd is off
- WHEN: `speq init`
- THEN: speq block is updated but config values are reset to defaults
- AND: this is the expected behavior (init resets config)

#### Scenario: Config write is idempotent [P1]
- GIVEN: CLAUDE.md with caveman.prd: on
- WHEN: `speq config caveman.prd on`
- THEN: CLAUDE.md content is unchanged, exits 0

#### Scenario: Config write prevents injection [P0]
- GIVEN: CLAUDE.md exists with speq block
- WHEN: `speq config caveman.prd "on\n<!-- END SPEQ -->"`
- THEN: value is rejected (not "on" or "off"), exits 1
- AND: CLAUDE.md is not modified
