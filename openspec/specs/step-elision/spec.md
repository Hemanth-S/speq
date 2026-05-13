# step-elision Spec

## Purpose
Skip pipeline steps when the configured model declares a matching capability, recording the elision in the run log.

## Refs
- Tables: none
- APIs: none (library module)
- Reuses: config-loading (`loadConfig`), `models.yaml` (capability declarations), `.speq/runs/<run-id>/` (run log)
- New: `skip_if` config field per step, capability flag evaluation logic

## Requirements

### Req: Capability-Based Step Skip
SHALL evaluate `skip_if` conditions against the configured model's declared capabilities and elide matching steps.

#### P1: Step elided when capability matches
- GIVEN: `speq.config.yaml` has `steps.verify.skip_if: "capability >= verify-native"` and the configured model's entry in `models.yaml` declares `capabilities: [verify-native]`
- WHEN: the pipeline reaches the verify step
- THEN: the verify step is skipped, a log entry `{ step: "verify", action: "elided", reason: "capability verify-native" }` is written to `.speq/runs/<run-id>/elisions.json`

#### P1: Step runs when capability absent
- GIVEN: `speq.config.yaml` has `steps.verify.skip_if: "capability >= verify-native"` and the configured model does NOT declare `verify-native`
- WHEN: the pipeline reaches the verify step
- THEN: the verify step executes normally, no elision logged

#### P1: No skip_if means step always runs
- GIVEN: `speq.config.yaml` has no `skip_if` for the spec step
- WHEN: the pipeline reaches the spec step
- THEN: the spec step executes normally regardless of model capabilities

### Req: Elision Logging
SHALL record every elision decision for auditability.

#### P1: Idempotent elision log
- GIVEN: an elision was logged for step verify in run X
- WHEN: the same pipeline config runs again producing run Y
- THEN: run Y has its own `elisions.json` with the same content, run X's log is unchanged

#### P0: Elision cannot bypass security gate
- GIVEN: `speq.config.yaml` has `steps.verify.skip_if: "capability >= verify-native"`
- WHEN: the verify step would be elided
- THEN: the security sub-gate of verify (ADR compliance, injection tests) still runs even if the full verify step is elided

#### P2: Missing models.yaml capability section
- GIVEN: `models.yaml` entry for the configured model has no `capabilities` field
- WHEN: a step with `skip_if` is evaluated
- THEN: the step runs normally (no capabilities = no elision), a warning is logged
