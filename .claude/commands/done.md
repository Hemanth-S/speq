---
description: Close the feature cycle — reconcile specs, finalize all docs, archive changes
---

You are closing out the feature cycle cleanly.
Follow every step in order.

## Step 1 — Pre-conditions (hard gates)

Run: bd list --status open
If any tasks are open: STOP. Tell the user to finish all tasks
and run /project:verify before running this command.

Run the full test suite. If anything fails: STOP. Tell the user
to fix all failures first.

Search for untracked TODO/FIXME:
  grep -rn "TODO\|FIXME\|HACK\|XXX" \
    --include="*.js" --include="*.ts" --include="*.py" --include="*.go" \
    . 2>/dev/null | grep -v ".git/" | grep -v "node_modules/" \
    | grep -v "bd-[a-z0-9]"

For each result: ask the user to either create a bd task for it
(note the ID in a comment) or resolve it inline. Do not proceed
until all are handled.

## Step 2 — Reconcile specs with implementation

Read each openspec/specs/*/spec.md and compare against what was built.

Classify each Requirement and Scenario:
  MATCHES              — spec reflects reality exactly — no change needed
  IMPLEMENTED DIFFERENTLY — update the spec to match actual behaviour
  PARTIALLY IMPLEMENTED   — add <!-- PARTIAL: <reason> --> inline
                            and create a bd task for the remainder
  NOT IMPLEMENTED         — add <!-- DEFERRED: <reason> --> inline
                            and create a bd task if one does not exist
  NEW behavior added      — add a new Scenario documenting what was built
  SUPERSEDED              — add <!-- SUPERSEDED: replaced by <name> -->

Output a reconciliation table:
  | Spec | Matched | Updated | Deferred | New scenarios added |

## Step 3 — Finalize documentation

  - Verify README.md has a current "Quick start" that reflects the
    final state of the feature
  - Verify docs/api.md reflects the final API surface — add any
    endpoints written during implementation that are not yet documented
  - Add a CHANGELOG.md entry:
      ## [Unreleased] — <today's date>
      ### Added
      - [new capabilities]
      ### Changed
      - [modifications to existing behaviour]
      ### Fixed
      - [bug fixes if any]
  - Verify every environment variable used anywhere in the codebase
    is documented in README.md under "Configuration"

## Step 4 — Archive completed changes

  If openspec/changes/ exists:
    List its contents: ls openspec/changes/
    For each directory not already in archive/:
      - Read proposal.md and confirm the intent was fully delivered
      - Move to: openspec/changes/archive/<YYYY-MM-DD>-<change-id>/
    Confirm openspec/changes/ now contains only active in-progress work.

## Step 5 — Final report

Run: bd ready
Note any epics now unblocked.

Print a summary:
  Specs reconciled:     N
  Specs updated:        N — [list which]
  Scenarios deferred:   N — [list bd task IDs]
  New scenarios added:  N
  Docs files updated:   [list]
  Changes archived:     N
  Next unblocked epic:  [title and ID, or "none"]

  Project status: ready for next feature cycle ✓
