---
description: Translate OpenSpec files into a Beads (bd) issue graph with TDD sub-tasks and dependency mapping
---

You are building a Beads task graph from OpenSpec specs.
Follow every step in order. Execute bd commands one at a time —
never chain with && and never write shell scripts.

## Step 1 — Check prerequisites

Run: bd --version
If the command is not found, install it: npm install -g @beads/bd
Then verify again before continuing.

Check for existing init: ls .beads
If .beads exists: report its contents and ask the user how to proceed.
If not: run bd init and ask the user which mode to use before proceeding:
  - default:      commits .beads to the repo (use if you own the project)
  - --stealth:    keeps .beads local, nothing committed (use for personal use)
  - --contributor: routes to a separate repo (use for shared/open-source)

## Step 2 — Read all spec files

Find and fully read every file matching openspec/specs/*/spec.md.

## Step 3 — Produce a written plan (no bd commands yet)

For each spec file, output:

  Epic:      "<capability>: <purpose summary>"

  Tasks:     one per Requirement — use the Requirement name verbatim

  Sub-tasks per Scenario, in this strict order:
    1. "Write failing test: <Scenario name>"
    2. "Implement: <Scenario name>"
    3. "Verify: <Scenario name> passes"
    4. "Write docs: <Scenario name>"
    After all scenarios for the Requirement:
    5. "Refactor: <Requirement name>"

  Priority rules:
    P0 — security, auth, payments, data integrity, failure modes
    P1 — core happy-path, idempotency, performance scenarios
    P2 — edge cases, error states
    P3 — optional or low-risk scenarios

Output a summary table:
  | Epic | Tasks | Sub-tasks | Est. bd commands |

Ask the user: "Does this plan look correct? Reply yes to create the tasks."
Wait for confirmation before running any bd commands.

## Step 4 — Create epics, tasks, and sub-tasks

Process one capability at a time.

For each bd create command:
  - Run it as a single, individual tool call
  - Read the full output to get the returned ID (e.g. bd-a1b2)
  - Store the ID in memory with a descriptive label
    (e.g. EPIC_AUTH = bd-a1b2, TASK_TOKEN_VALIDATION = bd-c3d4)
  - Use the literal returned ID in subsequent --parent flags
  - Never use shell variable syntax like $EPIC_AUTH

Order per capability:
  1. Create the Epic
  2. Create each Task under the Epic (confirm Epic ID before starting)
  3. Create all sub-tasks under each Task before moving to the next Task
     (confirm Task ID before creating its sub-tasks)

## Step 5 — Map dependencies

After ALL tasks and sub-tasks exist, apply dependencies.
Run each bd dep add as a separate tool call.

Sub-task chain (for every Scenario):
  bd dep add <IMPL>    <TEST>     ← Implement blocked by failing test
  bd dep add <VERIFY>  <IMPL>     ← Verify blocked by Implement
  bd dep add <DOCS>    <VERIFY>   ← Docs written after Verify passes

Requirement gate:
  bd dep add <REFACTOR> <VERIFY_x>  ← one per Scenario in the Requirement
                                       Refactor only starts when all Verifies pass

Intra-spec sequencing (if Requirements have natural order):
  bd dep add <TASK_later> <REFACTOR_earlier>

Happy-path before error-path (within a Task):
  bd dep add <TEST_error_scenario> <VERIFY_happy_scenario>

Cross-spec (e.g. auth blocks all other capabilities):
  bd dep add <EPIC_blocked> <REFACTOR_<last-req-of-blocking-epic>>

## Step 6 — Confirm readiness

Run: bd ready
Show the full output.

Tell the user: "Task graph created. Run /project:implement to begin —
or /project:ship is already handling this if you used that command."
