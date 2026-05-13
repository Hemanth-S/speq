# eval-workflow Spec

## Purpose
Manage eval fixtures and replay /ship against them to detect regressions via golden-output comparison.

## Refs
- Tables: none (file-based)
- APIs: none (CLI subcommand + slash command)
- Reuses: config-loading (`evals.fixtures_path`), `src/runner.ts` (subprocess execution)
- New: `.speq/evals/fixtures/` (fixture repos), `.speq/evals/runs/<timestamp>/` (run results), `speq eval fixture add`, `/project:eval-workflow`

## Requirements

### Req: Fixture Management
SHALL add, validate, and store eval fixtures with size discipline.

#### P1: Fixture added with exclusions
- GIVEN: a source directory at `/tmp/test-fixture` containing `.git/`, `node_modules/`, `dist/`, `prd-test.md`, and `src/`
- WHEN: `speq eval fixture add /tmp/test-fixture` runs
- THEN: fixture copied to `.speq/evals/fixtures/test-fixture/` excluding `.git`, `node_modules`, `dist`; total size <1MB

#### P0: Fixture with credentials rejected
- GIVEN: a source directory containing a `.env` file with `API_KEY=sk-live-abc123`
- WHEN: `speq eval fixture add /tmp/test-fixture` runs
- THEN: warning displayed about potential credentials in `.env`, fixture not added until user confirms exclusion of the file

#### P1: Oversized fixture rejected
- GIVEN: a source directory totaling 5MB after exclusions
- WHEN: `speq eval fixture add /tmp/large-fixture` runs
- THEN: error "Fixture exceeds 1MB limit (5MB after exclusions)", fixture not added

#### P1: Idempotent fixture add
- GIVEN: fixture `test-fixture` already exists in `.speq/evals/fixtures/`
- WHEN: `speq eval fixture add /tmp/test-fixture` runs again
- THEN: existing fixture is replaced (not duplicated), result is byte-identical if source unchanged

### Req: Workflow Eval Execution
SHALL replay /ship against each fixture and report diff vs. golden output.

#### P1: Regression detected
- GIVEN: fixture `test-fixture` has a golden expected output and a prompt version change in `speq.config.yaml`
- WHEN: `/project:eval-workflow` runs
- THEN: the fixture is replayed, diff vs. golden is computed, result written to `.speq/evals/runs/<timestamp>/test-fixture.json` with severity rating

#### P2: Failing fixture does not block others
- GIVEN: fixture `broken-fixture` has a missing PRD file and fixture `good-fixture` is valid
- WHEN: `/project:eval-workflow` runs
- THEN: `broken-fixture` reports failure, `good-fixture` runs and reports independently, aggregate report includes both

#### P1: Eval results written for history
- GIVEN: a completed eval run
- WHEN: results are written
- THEN: `.speq/evals/runs/<timestamp>/` contains one JSON per fixture plus a `summary.json` with pass/fail/regression counts

### Req: Performance
SHALL complete within time budget.

#### P1: Single fixture eval under 5min
- GIVEN: a fixture with a minimal PRD and 2 specs
- WHEN: workflow eval replays `/ship` against it
- THEN: completes in <5min (inclusive of LLM inference)
