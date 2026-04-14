---
description: TDD implementation loop — runs autonomously until all Beads tasks are closed
---

You are implementing all open tasks using strict TDD.
This command runs in a continuous loop until `bd list --status open`
returns empty. Do not stop between tasks and do not ask the user
whether to continue — move automatically to the next ready task.

## Entry check

Run: bd list --status open
If empty: tell the user "All tasks complete. Run /project:verify." and stop.

## Main loop

Repeat the following until `bd list --status open` is empty.

────────────────────────────────────────────────────────────────
### A — Select and claim the next task
────────────────────────────────────────────────────────────────

Run: bd ready
Select the highest-priority task with no open blockers.

Run: bd show <task-id> --tree
Read every sub-task. Identify which spec.md file covers this task
and read the full Requirement and all its Scenarios before writing
any code.

Confirm internally:
  - Task title and the Requirement it belongs to
  - The OpenSpec capability and spec file path
  - Which sub-task is first (must be "Write failing test: ...")
  - Any cross-spec dependencies not yet closed

If the first sub-task is not a "Write failing test" item, stop and
report the unexpected state before doing anything else.

Claim the task: bd update <task-id> --claim

────────────────────────────────────────────────────────────────
### B — Per-scenario TDD loop
────────────────────────────────────────────────────────────────

Process scenarios in priority order: P0 first, then P1, then P2/P3.
Do not start a lower-priority scenario until all higher-priority
Verify sub-tasks under the same Task are closed.

For each Scenario:

**B-1. Write failing test**

  Claim: bd update <test-subtask-id> --claim

  Re-read the exact Scenario from the spec file:
    GIVEN / WHEN / THEN / AND

  Write a test that directly encodes this contract:
    - Use real table names and API paths from the spec's
      Codebase references section
    - The test must set up the GIVEN, trigger the WHEN,
      and assert every clause of THEN and AND
    - Use the same test framework already in the project
      (detect it from existing test files)

  Run the test. Evaluate the result:
    ASSERTION FAILURE → correct, this is a genuine red. Continue.
    SYNTAX ERROR or IMPORT ERROR → fix the error first.
      A test that cannot run does not count as "red".
      Do not close this sub-task until the test runs and fails
      for the right reason.

  Close: bd update <test-subtask-id> --status done

**B-2. Implement**

  Claim: bd update <impl-subtask-id> --claim

  Write the minimum code needed to make this specific test pass.
  Do not implement behaviour beyond what the test requires.

  Security checklist — verify each before closing:
    □ All user inputs validated and sanitised before processing
    □ Authentication checked before any data access
    □ Authorization checked (ownership, role, scope)
    □ No sensitive data (passwords, tokens, PII) written to logs
    □ Error responses do not expose stack traces or internal paths
    □ No secrets or credentials in source code
    □ No new dependency added without checking for known CVEs

  Run the failing test. Confirm it now passes.
  Run the full test suite. If any previously passing test now fails,
  fix the regression before closing this sub-task.

  Close: bd update <impl-subtask-id> --status done

**B-3. Verify (acceptance criteria gate)**

  Claim: bd update <verify-subtask-id> --claim

  Re-read the original Scenario from the spec: GIVEN / WHEN / THEN / AND

  Go through each clause explicitly:
    □ GIVEN — the test correctly sets up the stated precondition
    □ WHEN  — the test triggers the exact stated event
    □ THEN  — every stated outcome is asserted (not just the happy branch)
    □ AND   — every additional stated outcome is also asserted

  If any clause is not covered by the test, update the test now,
  re-run it to confirm it passes, then close this sub-task.

  Run the full test suite. All tests must be green before closing.

  Close: bd update <verify-subtask-id> --status done

**B-4. Write docs**

  Claim: bd update <docs-subtask-id> --claim

  For every new public function, method, class, or API endpoint
  created while implementing this Scenario:

    Functions/methods/classes:
      Add a docstring, JSDoc block, or equivalent in the language
      in use. Include: what it does, parameters with types,
      return value, and any error conditions it raises or returns.

    API endpoints:
      Update docs/api.md (create it if it does not exist) with:
        - Method and path
        - Auth requirement
        - Request body schema (if any) with field descriptions
        - Response schema for success and each error case
        - Example request and response

    Environment variables:
      If any new env var is required, add it to README.md under
      a "Configuration" or "Environment variables" section with:
        - Variable name
        - Purpose
        - Required or optional
        - Example value (never a real secret)

    User-facing behaviour changes:
      Update README.md if the change affects how users interact
      with the system.

  Close: bd update <docs-subtask-id> --status done

────────────────────────────────────────────────────────────────
### C — After all Scenarios for the Task
────────────────────────────────────────────────────────────────

**Refactor**

  Claim: bd update <refactor-subtask-id> --claim

  Review the implementation across all Scenarios in this Task for:
    - Clarity: would a new engineer understand this without explanation?
    - Duplication: is logic repeated that could be extracted?
    - Naming: do names reflect intent, not implementation?
    - Structure: are concerns properly separated?

  Make improvements. All tests must stay green throughout.
  Run the full test suite to confirm.

  Close: bd update <refactor-subtask-id> --status done

**Close the Task**

  bd update <task-id> --status done

────────────────────────────────────────────────────────────────
### D — Continue the loop
────────────────────────────────────────────────────────────────

Run: bd ready
Go back to Step A. Do not pause, do not ask the user whether to continue.

Keep looping until: bd list --status open returns empty.

When it does: tell the user "All tasks complete. Run /project:verify."
