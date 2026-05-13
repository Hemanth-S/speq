# sprint-board Spec

## Purpose
Render current pipeline run state, Beads issues, configuration, and cost data as a self-contained HTML file.

## Refs
- Tables: none (reads Beads state via `bd` CLI)
- APIs: `bd list`, `bd show` (via spawnSync)
- Reuses: config-loading (configuration panel data), cost-telemetry (`.speq/runs/` data), `src/cli.ts` (command registration)
- New: `.speq/board.html` (output), `src/board.ts` (HTML renderer), `.claude/commands/project-board.md` (one-line shim)

## Requirements

### Req: Pipeline Lane Rendering
SHALL render pipeline steps as lanes with the current step highlighted.

#### P1: Current step highlighted
- GIVEN: a `/ship` run is at the `/implement` phase and `.speq/runs/<run-id>/` has records for enrich, spec, plan
- WHEN: `/project:board` renders `board.html`
- THEN: HTML shows 6 pipeline lanes (enrich → spec → plan → implement → verify → done), implement lane highlighted as active, enrich/spec/plan marked complete

#### P1: Beads issue cards rendered
- GIVEN: `bd list` returns 5 issues with varying statuses and complexity labels
- WHEN: board renders
- THEN: each issue appears as a card showing: id, title, status, complexity label, and test status

### Req: Configuration Panel
SHALL display per-step configuration (model, prompt version, implementation).

#### P1: Config panel reflects current settings
- GIVEN: `speq.config.yaml` has `steps.implement.model: sonnet`, `steps.spec.prompt_version: v2`
- WHEN: board renders
- THEN: configuration panel shows each step with its model, prompt version, and implementation source

#### P1: Config change reflected on re-render
- GIVEN: user changes `steps.implement.model` from `sonnet` to `opus`
- WHEN: board is re-rendered (manual refresh)
- THEN: configuration panel shows `opus` for implement step

### Req: Cost Panel
SHALL display tokens used, predicted total, and historical comparison.

#### P1: Cost data displayed
- GIVEN: `.speq/runs/<run-id>/summary.json` has `total_tokens_in: 50000`, `total_tokens_out: 20000`, `estimated_cost_usd: 1.25`
- WHEN: board renders
- THEN: cost panel shows tokens in/out, estimated cost, and wall clock time

#### P2: Run history displayed
- GIVEN: 3 previous runs exist in `.speq/runs/`
- WHEN: board renders
- THEN: run history section shows last 3 runs with timestamp, outcome (pass/fail), and cost

### Req: Security and Self-Containment

#### P0: Board contains no secrets
- GIVEN: `speq.config.yaml` contains model names and env vars reference API keys
- WHEN: board renders
- THEN: `board.html` contains model names and config values only — no env var values, no API keys, no file contents

#### P1: Board is self-contained HTML
- GIVEN: board is rendered
- WHEN: `board.html` is opened in a browser
- THEN: page renders without any network requests (all CSS/JS inlined), except optional CDN-loaded styling that degrades gracefully if offline

### Req: Performance and Idempotency

#### P1: Render under 2s
- GIVEN: a project with 80 Beads issues and 5 historical runs
- WHEN: board renders
- THEN: `.speq/board.html` is written in <2s

#### P1: Idempotent render
- GIVEN: same Beads state, same config, same cost data
- WHEN: board rendered twice
- THEN: both `board.html` outputs are identical

#### P2: Beads unavailable graceful degrade
- GIVEN: `bd list` fails (Beads not initialized)
- WHEN: board renders
- THEN: board renders pipeline lanes and config panel, issue cards section shows "Beads unavailable", no crash
