# adr-bootstrap Spec

## Purpose
Generate draft ADRs from an existing codebase via structural scan, docs ingestion, and interactive interview.

## Refs
- Tables: none (file-based)
- APIs: none (CLI subcommand + Claude-driven prompt)
- Reuses: adr-management (ADR file creation), config-loading (project config)
- New: `.claude/commands/project-adr-bootstrap.md` (prompt), structural scan helpers in `src/adr-bootstrap.ts`

## Requirements

### Req: Structural Scan
SHALL infer architecture decisions from dependency manifests, config files, and folder structure.

#### P1: Package.json dependencies detected
- GIVEN: `package.json` lists `vitest`, `typescript`, and `drizzle-orm` as dependencies
- WHEN: `/project:adr-bootstrap` structural scan runs
- THEN: draft ADRs generated for "Use TypeScript", "Use Vitest for testing", "Use Drizzle ORM" (or similar), each with `status: draft` and evidence cited in Context section

#### P1: Folder structure inferred
- GIVEN: project has `src/`, `test/`, `docs/`, `openspec/` directories
- WHEN: structural scan runs
- THEN: at least one draft ADR captures the project structure pattern (e.g., "Separate test directory from source")

#### P1: Idempotent bootstrap on existing ADRs
- GIVEN: `docs/adr/0001-use-typescript.md` exists with `status: active`
- WHEN: `/project:adr-bootstrap` runs again
- THEN: no duplicate "Use TypeScript" draft created, only genuinely new decisions produce new drafts

### Req: Docs Ingestion
SHALL parse README.md, CONTRIBUTING.md, and similar docs for stated decisions.

#### P1: README decisions captured
- GIVEN: README.md contains "speq enforces a disciplined workflow where tests are written before code"
- WHEN: docs ingestion pass runs
- THEN: a draft ADR capturing TDD-first workflow is generated with the README quote in Context

### Req: Interactive Interview
SHALL surface clarifying questions for low-confidence drafts.

#### P1: Low-confidence draft triggers question
- GIVEN: structural scan detects both `vitest` and `jest` in devDependencies (ambiguous)
- WHEN: interactive interview runs
- THEN: user is asked "Both vitest and jest detected — which is the primary test framework?", answer incorporated into the draft ADR

### Req: Commit Epoch Clustering (optional)
SHALL group commits by scope when `--include-history` is passed.

#### P2: Epoch boundary generates ADR
- GIVEN: `--include-history` flag is set and git log shows a commit cluster adding `drizzle-orm`, `drizzle-kit`, and `src/db/` in the same week
- WHEN: commit-epoch clustering runs
- THEN: a draft ADR is generated for the ORM adoption, with the commit date range cited

#### P0: Bootstrap preserves existing active ADRs
- GIVEN: `docs/adr/0001-use-typescript.md` has `status: active`
- WHEN: `/project:adr-bootstrap` runs and encounters an error midway
- THEN: ADR 0001 is unchanged, any drafts produced before the error are preserved on disk

#### P2: Large repo scan within performance budget
- GIVEN: a repo with 500 files and 10 dependency manifests
- WHEN: structural scan runs
- THEN: completes in <5s (scan only, excluding LLM inference time)
