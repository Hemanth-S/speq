---
description: Full pipeline — enrich PRD → spec → plan → implement → verify → done. Runs autonomously from a PRD to a shipped, verified, documented feature.
---

You are running the complete speq pipeline from an existing PRD to
a shipped feature. Execute each phase fully and in order.

Run all phases autonomously. Do not ask the user whether to continue
between phases. Stop only when:
  a) A hard error occurs (missing file, command fails, test errors out)
  b) An unresolved <!-- CONFLICT --> or <!-- UNDERSPECIFIED --> flag
     is found in the PRD and requires a stakeholder decision
  c) /verify produces a ❌ FAIL

In any of those cases: stop, report the exact blocker clearly, and wait.

━━━ PHASE 1 — ENRICH ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Execute all steps from /enrich.

Exit condition: the PRD file contains completed sections for Codebase
Integration, NFRs, Security & Compliance, Failure Modes, and
Definition of Done, with zero unresolved <!-- CONFLICT --> or
<!-- UNDERSPECIFIED --> flags.

If flags remain: STOP. Show each flag to the user and wait for
a decision on every one before proceeding.

━━━ PHASE 2 — SPEC ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Execute all steps from /spec.

Do not pause to ask the user to confirm capabilities — infer them
from the PRD and proceed. The user can run /spec manually
if they want to iterate on capabilities before generating specs.

Exit condition: at least one openspec/specs/*/spec.md file exists,
every spec has the four mandatory scenario types, and no spec
contains an unresolved <!-- TODO: clarify --> comment.

━━━ PHASE 3 — PLAN ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Execute all steps from /plan.

Do not pause to ask the user to confirm the task plan — generate
the full Beads graph and proceed.

Exit condition: bd ready returns at least one task with no blockers.

━━━ PHASE 4 — IMPLEMENT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Execute all steps from /implement.

Run the TDD loop continuously until bd list --status open is empty.

Exit condition: bd list --status open returns empty.

━━━ PHASE 5 — VERIFY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Execute all steps from /verify.

Exit condition: every applicable gate outputs ✅ PASS.

If any gate outputs ❌ FAIL: STOP. Show the exact failures to the
user and wait. Once the user confirms fixes are applied, re-run
/verify. Do not proceed to Phase 6 with any open failures.

━━━ PHASE 6 — DONE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Execute all steps from /done.

━━━ PIPELINE SUMMARY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Output a final table:

| Phase | Status | Notes |
|-------|--------|-------|
| Enrich | ✅ | N assumptions, N conflicts resolved |
| Spec | ✅ | N capabilities, N scenarios |
| Plan | ✅ | N epics, N tasks, N sub-tasks |
| Implement | ✅ | N tasks, N tests written |
| Verify | ✅ | N gates passed |
| Done | ✅ | N specs reconciled, N docs updated |

Project status: shipped ✓
