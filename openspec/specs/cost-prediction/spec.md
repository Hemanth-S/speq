# cost-prediction Spec

## Purpose
Estimate pipeline run costs from model card pricing and historical data, with optional budget guardrails.

## Refs
- Tables: none (file-based)
- APIs: none (library module)
- Reuses: cost-telemetry (historical run data in `.speq/runs/`), `models.yaml` (pricing per model), config-loading (`--max-cost` flag)
- New: `src/cost-prediction.ts`, pricing data in `models.yaml`

## Requirements

### Req: Cold Start Prediction
SHALL provide rough cost estimates when no historical data exists.

#### P1: Estimate from model card
- GIVEN: no historical runs exist (`.speq/runs/` empty) and `models.yaml` lists pricing for sonnet at $3/1M input, $15/1M output
- WHEN: `predictCost(config)` is called before a `/ship` run
- THEN: returns an estimate object with per-step predicted tokens (from shipped averages) and total estimated cost in USD, with `confidence: "low"`

#### P1: Idempotent prediction
- GIVEN: same config and same historical data
- WHEN: `predictCost(config)` is called twice
- THEN: both calls return identical estimates

### Req: Historical Regression
SHALL improve predictions after N>=5 runs using project-specific data.

#### P1: Regression-based prediction
- GIVEN: 5+ historical runs in `.speq/runs/` with varying repo sizes and spec counts
- WHEN: `predictCost(config)` is called
- THEN: returns an estimate with `confidence: "medium"` or `confidence: "high"`, per-step predicted tokens derived from regression on `(repo_size, prd_size, spec_count)`, and a confidence band (low–high range)

#### P1: Model change recomputes prediction
- GIVEN: 5+ historical runs and user changes `steps.implement.model` from `sonnet` to `haiku`
- WHEN: `predictCost(config)` is called
- THEN: estimate reflects haiku's lower pricing, shows cost delta vs. previous model

### Req: Budget Guardrail
SHALL halt pipeline before a step that would exceed the cost budget (when --max-cost is set).

#### P1: Over-budget step halts with prompt
- GIVEN: `--max-cost 5` is set, 3 steps completed costing $4.50, next step predicted at $1.20 (total would be $5.70)
- WHEN: pipeline is about to execute the next step
- THEN: pipeline halts, user is prompted "Predicted total $5.70 exceeds budget $5.00. Continue? [y/N]"

#### P1: Under-budget continues silently
- GIVEN: `--max-cost 10` is set and predicted total is $3.00
- WHEN: pipeline executes each step
- THEN: no interruption, steps proceed normally

#### P0: No --max-cost means no budget enforcement
- GIVEN: no `--max-cost` flag is set
- WHEN: pipeline runs regardless of cost
- THEN: pipeline proceeds without cost checks, no prompt shown (cost is informational only on the board)

#### P2: Budget with no prediction data
- GIVEN: `--max-cost 5` is set but no historical data exists
- WHEN: pipeline starts
- THEN: cold-start estimates are used for budget checks, user warned that estimates have low confidence
