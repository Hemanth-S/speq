# thrum-state Spec

## Purpose
Write orchestrator decisions to a local thrum profile for durable state that survives session restarts, enabling resume and PR enrichment.

## Refs
- Tables: none
- APIs: thrum CLI (external, optional)
- Reuses: `src/resume.ts` (`detectState` extended), `src/index.ts` (pipeline orchestration), config-loading
- New: `src/thrum.ts` (integration module), thrum decision log entries

## Requirements

### Req: Decision Log Writes
SHALL write orchestrator decisions to thrum during /plan, /implement, and /verify.

#### P1: Decision logged during implement
- GIVEN: thrum is installed and configured
- WHEN: `/implement` skips task T-12 because dependency T-09 changed signature
- THEN: a thrum message is written: `{ type: "decision", step: "implement", task: "T-12", action: "skipped", reason: "dependency T-09 signature changed" }`

#### P1: Decision logged during plan
- GIVEN: thrum is installed
- WHEN: `/plan` reroutes task T-15 due to a dependency change
- THEN: a thrum message captures the rerouting decision with task IDs and reason

#### P0: Thrum messages contain no secrets
- GIVEN: any pipeline decision is logged
- WHEN: thrum message is written
- THEN: message contains only task IDs, action types, and reasoning text — no API keys, tokens, file contents, or user credentials

#### P1: Idempotent decision write
- GIVEN: the same decision for task T-12 skip
- WHEN: written twice (e.g., on retry)
- THEN: thrum log contains only one entry for that decision (deduplication by task+action key)

### Req: Resume from Thrum State
SHALL recover mid-step orchestrator context from thrum log on /ship --resume.

#### P1: Resume recovers decisions
- GIVEN: a `/ship` run interrupted mid-`/implement` with 3 decisions logged in thrum
- WHEN: `/ship --resume` runs
- THEN: all 3 decisions are read from thrum, implement resumes with knowledge of prior skips/reroutes, already-completed work is not repeated

#### P1: Resume without thrum falls back to Beads
- GIVEN: thrum is not installed but Beads has task state
- WHEN: `/ship --resume` runs
- THEN: resume works using Beads artifact detection (existing `detectState()` behavior), warning logged "thrum not available — resuming from Beads state only"

### Req: PR Description Enrichment
SHALL populate the PR description with a Decisions section from thrum log.

#### P1: Done includes decisions section
- GIVEN: thrum log has 5 decision entries for the current run
- WHEN: `/done` generates the PR description
- THEN: description includes a "## Decisions" section listing each decision with task, action, and reason

#### P2: Done without thrum omits section
- GIVEN: thrum is not installed
- WHEN: `/done` generates the PR description
- THEN: "Decisions" section is omitted (not an empty section), no error

### Req: Graceful Degradation

#### P2: Thrum unavailable at runtime
- GIVEN: thrum was installed at init but is now unavailable (uninstalled/broken)
- WHEN: a pipeline step attempts to log a decision
- THEN: warning logged to stderr "thrum unavailable — decisions not persisted", pipeline continues without crash

### Req: Performance

#### P1: Decision write under 20ms
- GIVEN: thrum is installed and accessible
- WHEN: a decision is written
- THEN: write completes in <20ms
