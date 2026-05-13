# lazy-scan Specification

## Purpose
Replace the full upfront codebase scan in `/requirements` and `/enrich`
with a lightweight initial scan and on-demand deeper pulls.

## Codebase references
- Services/modules reused:
  - `.claude/commands/requirements.md` — Step 1 codebase scan
  - `.claude/commands/enrich.md` — codebase grounding step

## Requirements

### Requirement: Lightweight Initial Scan
The `/requirements` and `/enrich` commands SHALL perform only a minimal
scan before starting the conversation.

#### Scenario: Requirements lightweight scan [P1]
- GIVEN: user runs `/requirements` in a project
- WHEN: the command starts Step 1
- THEN: scans only: file tree (depth-limited) and README.md/CLAUDE.md
- AND: does NOT read schemas, routes, env vars, or service files upfront
- AND: proceeds to questions after the lightweight scan

#### Scenario: Enrich lightweight scan [P1]
- GIVEN: user runs `/enrich` on an existing PRD
- WHEN: the command starts its codebase grounding step
- THEN: scans only: file tree and README.md/CLAUDE.md
- AND: does NOT read schemas, routes, env vars, or service files upfront

#### Scenario: Lightweight scan completes when files missing [P1]
- GIVEN: project has no README.md or CLAUDE.md
- WHEN: lightweight scan runs
- THEN: scan completes with just the file tree
- AND: conversation proceeds normally

### Requirement: On-Demand Deep Scanning
When a conversation question requires codebase context, the command
SHALL scan the relevant artifacts at that point.

#### Scenario: Schema scan triggered by database question [P1]
- GIVEN: lightweight scan completed, user describes a feature touching a database
- WHEN: the command needs to reference existing tables
- THEN: reads schema files (*.sql, schema.prisma, models.py, *.graphql, migrations)
- AND: references real table/column names in the next question

#### Scenario: Route scan triggered by API question [P1]
- GIVEN: lightweight scan completed, user describes an API feature
- WHEN: the command needs to reference existing endpoints
- THEN: reads route/controller/handler files
- AND: references real endpoint paths in the next question

#### Scenario: Env var scan triggered by config question [P1]
- GIVEN: lightweight scan completed, user mentions environment config
- WHEN: the command needs to know existing env vars
- THEN: greps for process.env/os.environ/os.getenv patterns
- AND: references real variable names in the next question

#### Scenario: No duplicate scanning [P1]
- GIVEN: schemas were already scanned on demand earlier in the conversation
- WHEN: a later question also needs schema context
- THEN: the command does not re-scan schemas
- AND: uses the context already gathered

#### Scenario: Deep scan finds nothing [P1]
- GIVEN: on-demand schema scan is triggered
- WHEN: no schema files exist in the project
- THEN: the command notes the absence and continues
- AND: does not error or retry
