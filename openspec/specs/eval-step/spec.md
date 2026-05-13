# eval-step Spec

## Purpose
Score individual step outputs against rubrics using a Haiku-backed grader, with auto-trigger on config changes.

## Refs
- Tables: none (file-based)
- APIs: none (library module)
- Reuses: config-loading (rubric version registry), model-routing (Haiku grader invocation)
- New: `src/eval-step.ts`, rubric files per step, `.speq/evals/runs/<timestamp>/step-<name>.json`

## Requirements

### Req: Rubric-Based Grading
SHALL score a step's output against its declared rubric and produce a numeric score plus qualitative report.

#### P1: Step output scored
- GIVEN: the `/spec` step produced an OpenSpec file and the rubric for spec asks "covers security? failure? idempotency? performance?"
- WHEN: step eval runs for the spec step
- THEN: a score 0–100 is produced, a qualitative report lists which rubric criteria passed/failed, result written to `.speq/evals/runs/<timestamp>/step-spec.json`

#### P1: Score includes rubric version
- GIVEN: `speq.config.yaml` declares `evals.rubrics.spec: v2`
- WHEN: step eval runs for spec
- THEN: result JSON includes `rubric_version: "v2"` for reproducibility

#### P1: Idempotent grading
- GIVEN: same step output and same rubric version
- WHEN: step eval runs twice
- THEN: scores are within ±5 points (grader noise tolerance), both results persisted separately by timestamp

### Req: Auto-Trigger on Config Change
SHALL run affected step evals when a config change is saved via /project:config.

#### P1: Model change triggers eval
- GIVEN: user changes `steps.spec.model` from `sonnet` to `haiku` via `/project:config`
- WHEN: the config is saved
- THEN: step eval for spec auto-runs, delta vs. baseline score is reported to user before commit

#### P2: Unrelated config change does not trigger
- GIVEN: user changes `steps.implement.model` (unrelated to spec)
- WHEN: config is saved
- THEN: step eval for spec does NOT run, only implement step eval runs

### Req: Security
SHALL not leak step output content into eval results beyond what the rubric requires.

#### P0: Eval results contain scores only, not full output
- GIVEN: a step output containing user code and project details
- WHEN: step eval writes results to `.speq/evals/runs/`
- THEN: result JSON contains score, rubric criteria pass/fail, and qualitative summary — not the raw step output

### Req: Performance

#### P1: Step eval under 30s
- GIVEN: a single step output and its rubric
- WHEN: step eval grader runs
- THEN: completes in <30s including Haiku inference
