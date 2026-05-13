# cost-telemetry Spec

## Purpose
Instrument pipeline steps to emit per-run cost metadata records and produce run rollups.

## Refs
- Tables: none (file-based)
- APIs: none (library module)
- Reuses: `src/index.ts` (`runPhase` instrumentation), config-loading (run-id generation)
- New: `.speq/runs/<run-id>/<step>.json` (per-step records), `.speq/runs/<run-id>/summary.json` (rollup), `src/telemetry.ts`

## Requirements

### Req: Per-Step Usage Records
SHALL write a metadata record after each step completes (success or failure).

#### P1: Record written on step success
- GIVEN: the `/spec` step completes successfully using model `claude-haiku-4-5-20251001`
- WHEN: post-step instrumentation runs
- THEN: `.speq/runs/<run-id>/spec.json` is written with fields: `model`, `tokens_in`, `tokens_out`, `wall_clock_ms`, `retry_count`, `tool_call_count`, `status: "success"`, `source: "exact"|"estimated"`

#### P1: Record written on step failure
- GIVEN: the `/implement` step fails with a non-zero exit code
- WHEN: post-step instrumentation runs
- THEN: `.speq/runs/<run-id>/implement.json` is written with `status: "failed"`, all other metadata fields populated

#### P0: Records contain no prompt or output content
- GIVEN: any step completes
- WHEN: the usage record is written
- THEN: the JSON file contains only metadata fields (model, tokens, timing, counts, status, source) — no `prompt`, `output`, `content`, or `response` fields exist

#### P1: Idempotent step record
- GIVEN: `/spec` step is re-run in the same pipeline run
- WHEN: post-step instrumentation writes the record
- THEN: `.speq/runs/<run-id>/spec.json` is overwritten with the new run's data, other step records in the same run-id are unchanged

### Req: Usage Capture Implementations
SHALL support exact and estimated token counting with automatic fallback.

#### P1: Exact source when available
- GIVEN: Claude Code's token usage surface is accessible (probe succeeded at install)
- WHEN: a step completes
- THEN: record has `source: "exact"` and `tokens_in`/`tokens_out` from Claude Code's data

#### P1: Estimated fallback
- GIVEN: Claude Code's token usage surface is NOT accessible
- WHEN: a step completes
- THEN: record has `source: "estimated"` and `tokens_in`/`tokens_out` computed via character-count / 4 heuristic

### Req: Run Rollups
SHALL aggregate per-step records into a run summary.

#### P1: Summary computed from step records
- GIVEN: `.speq/runs/<run-id>/` contains step records for enrich, spec, plan, implement, verify, done
- WHEN: rollup runs
- THEN: `.speq/runs/<run-id>/summary.json` contains: `total_tokens_in`, `total_tokens_out`, `total_wall_clock_ms`, `step_count`, `status` (pass if all steps succeeded, fail otherwise), `estimated_cost_usd` (from model card pricing)

#### P2: Partial rollup on incomplete run
- GIVEN: pipeline failed at `/implement`, only enrich, spec, plan records exist
- WHEN: rollup runs
- THEN: summary includes data for 3 completed steps, `status: "failed"`, `completed_steps: 3`

### Req: Performance

#### P1: Record write under 50ms
- GIVEN: a step just completed
- WHEN: usage record is written to disk
- THEN: write completes in <50ms

#### P2: Filesystem failure graceful degrade
- GIVEN: `.speq/runs/` directory has permission denied
- WHEN: post-step instrumentation attempts to write
- THEN: a warning is logged to stderr, the pipeline continues, no crash
