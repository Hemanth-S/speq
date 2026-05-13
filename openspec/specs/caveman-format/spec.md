# caveman-format Specification

## Purpose
Define compressed output formats for PRDs, OpenSpec scenarios, and Beads
tasks. When enabled, artifacts use terse syntax that preserves all
machine-actionable information while cutting ~40% token usage.

## Codebase references
- Services/modules reused:
  - `.claude/commands/requirements.md` — PRD generation prompt
  - `.claude/commands/spec.md` — OpenSpec generation prompt
  - `.claude/commands/plan.md` — Beads task creation prompt
  - `src/config.ts` (new) — reads config from CLAUDE.md

## Requirements

### Requirement: Compressed PRD Format
When caveman.prd is on, generate a compressed PRD and a readable sidecar.

#### Scenario: Compressed PRD with readable sidecar [P1]
- GIVEN: caveman.prd is on in CLAUDE.md speq block
- WHEN: `/requirements` completes and writes the PRD
- THEN: writes `prd-<name>.md` in compressed format (no filler prose, bullet fragments, abbreviated table headers)
- AND: writes `prd-<name>.readable.md` in standard verbose format
- AND: both files contain identical requirements (same FR IDs, same tables, same threats)

#### Scenario: Verbose PRD only [P1]
- GIVEN: caveman.prd is off in CLAUDE.md speq block
- WHEN: `/requirements` completes and writes the PRD
- THEN: writes only `prd-<name>.md` in standard verbose format
- AND: no `.readable.md` sidecar is created

#### Scenario: Compressed PRD preserves all IDs and references [P0]
- GIVEN: caveman.prd is on
- WHEN: a compressed PRD is generated
- THEN: all FR-N IDs, NFR-* IDs, table names, endpoint paths, and threat entries are present
- AND: no machine-actionable information is removed
- AND: `/spec` can consume the compressed PRD without errors

#### Scenario: Compressed PRD format is consistent [P1]
- GIVEN: caveman.prd is on
- WHEN: `/requirements` generates a compressed PRD
- THEN: sections use abbreviated headers (e.g. "## Reqs" not "## Functional Requirements")
- AND: tables omit empty columns
- AND: prose descriptions are single-line fragments, not paragraphs

### Requirement: Compressed OpenSpec Format
When caveman.openspec is on, produce terse scenarios.

#### Scenario: Compressed OpenSpec scenarios [P1]
- GIVEN: caveman.openspec is on in CLAUDE.md speq block
- WHEN: `/spec` generates spec files
- THEN: scenarios use abbreviated format:
  ```
  #### P0: <title>
  - GIVEN: <condition>
  - WHEN: <trigger>
  - THEN: <outcome>, <outcome>, <outcome>
  ```
- AND: priority is in the header (not a separate line)
- AND: multiple THEN/AND clauses are comma-joined on one line

#### Scenario: Verbose OpenSpec scenarios [P1]
- GIVEN: caveman.openspec is off
- WHEN: `/spec` generates spec files
- THEN: scenarios use the standard format with full prose and separate AND lines

#### Scenario: Compressed spec preserves all clauses [P0]
- GIVEN: caveman.openspec is on
- WHEN: a compressed spec is generated
- THEN: every GIVEN, WHEN, THEN, and AND clause from the verbose equivalent is present
- AND: `/implement` B-3 verify step can check each clause individually

#### Scenario: All four mandatory scenario types present in compressed format [P0]
- GIVEN: caveman.openspec is on
- WHEN: `/spec` generates a capability spec
- THEN: spec contains security (P0), failure, idempotency, and performance scenarios
- AND: each scenario has GIVEN/WHEN/THEN structure

### Requirement: Compressed Beads Format
When caveman.beads is on, produce terse task descriptions.

#### Scenario: Compressed Beads task descriptions [P1]
- GIVEN: caveman.beads is on in CLAUDE.md speq block
- WHEN: `/plan` creates tasks via `bd create`
- THEN: task titles are max 60 chars
- AND: task descriptions use bullet fragments, not sentences
- AND: sub-task names follow pattern: "Test: <what>" / "Impl: <what>" / "Verify: <what>" / "Docs: <what>" / "Refactor"

#### Scenario: Verbose Beads task descriptions [P1]
- GIVEN: caveman.beads is off
- WHEN: `/plan` creates tasks
- THEN: tasks use the standard format with full prose descriptions

#### Scenario: Compressed tasks preserve spec references [P0]
- GIVEN: caveman.beads is on
- WHEN: a task is created
- THEN: the task description contains the spec file path and scenario title
- AND: `/implement` can trace the task back to its OpenSpec scenario
