# adr-enforcement Spec

## Purpose
Enforce active ADRs as pipeline gates in /requirements, /enrich, /plan, and /verify steps.

## Refs
- Tables: none (file-based)
- APIs: none (pipeline gate logic)
- Reuses: adr-management (ADR reading, status checks), config-loading (`adr.path`), `src/runner.ts` (step execution)
- New: ADR gate evaluation in pipeline steps, `/verify` eighth gate

## Requirements

### Req: ADR Surfacing in Requirements
SHALL surface relevant active ADRs during PRD gathering.

#### P1: Active ADR surfaced during /requirements
- GIVEN: `docs/adr/0007-no-redis.md` has `status: active` and tags `["caching", "infrastructure"]`
- WHEN: `/requirements` scans the codebase and the user's PRD mentions "caching layer"
- THEN: the ADR is surfaced with a note: "ADR-0007 says no Redis — consider for this PRD"

#### P2: Superseded ADR not surfaced
- GIVEN: `docs/adr/0003-use-express.md` has `status: superseded`
- WHEN: `/requirements` scans ADRs
- THEN: ADR-0003 is not surfaced as a constraint (its successor is)

### Req: ADR Violation Detection in Enrich
SHALL flag PRD claims that violate active ADRs before the PRD is locked.

#### P1: Violation flagged in /enrich
- GIVEN: `docs/adr/0007-no-redis.md` has `status: active` and the PRD states "Add Redis caching for session data"
- WHEN: `/enrich` runs cross-reference check
- THEN: a `<!-- CONFLICT: ADR-0007 prohibits Redis -->` comment is injected, enrich halts for user resolution

#### P0: ADR violation cannot be silently bypassed
- GIVEN: an active ADR prohibits a technology used in the PRD
- WHEN: `/enrich` detects the violation
- THEN: the pipeline does not proceed to `/spec` until the user either resolves the conflict or supersedes the ADR via `speq adr supersede`

### Req: ADR Compliance in Verify
SHALL add an ADR compliance gate to `/verify` that checks the diff against active ADRs.

#### P1: Verify gate passes when no violations
- GIVEN: active ADRs exist and the implementation diff does not violate any of them
- WHEN: `/verify` runs the ADR compliance gate
- THEN: gate passes, result logged as `{ gate: "adr-compliance", status: "pass", adrs_checked: N }`

#### P1: Verify gate fails with citation
- GIVEN: `docs/adr/0007-no-redis.md` is active and the diff adds `redis` to `package.json` dependencies
- WHEN: `/verify` runs the ADR compliance gate
- THEN: gate fails with message "ADR-0007 violated: no Redis — found redis in package.json", verify overall fails

#### P1: Idempotent gate evaluation
- GIVEN: the same diff and the same active ADRs
- WHEN: `/verify` ADR gate runs twice
- THEN: both runs produce the same pass/fail result

### Req: Performance
SHALL complete ADR scanning within budget.

#### P1: ADR scan under 2s
- GIVEN: 50 active ADRs in `docs/adr/`
- WHEN: the ADR gate runs during `/verify`
- THEN: completes in <2s
