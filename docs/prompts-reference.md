# Prompts reference

## Why the codebase is scanned before requirements are gathered

A PRD written in a vacuum produces specs that reference invented table names
and APIs. The resulting implementation plan will be full of mismatches —
column names that do not exist, endpoints that duplicate existing ones, and
service boundaries that conflict with the real architecture.

Scanning first means every question Claude asks is grounded in what actually
exists. The PRD will reference real column names, real endpoints, and real
service boundaries from the first draft. This eliminates an entire class of
rework that happens when a spec meets the codebase for the first time during
implementation.

## Why /enrich exists separately from /requirements

Product and business stakeholders often produce PRDs without engineering
input. These documents describe what the user needs but leave technical
details vague — "the user API" instead of `GET /api/v2/users/:id`, "the
database" instead of the `accounts` table with its `org_id` foreign key.

Enrich bridges that gap. It takes any PRD, no matter how vague on technical
detail, and grounds it in the real codebase before a single spec is written.
The `<!-- CONFLICT -->` and `<!-- UNDERSPECIFIED -->` flags create a
structured handoff back to the stakeholder for decisions that only they can
make, while engineering fills in everything that can be derived from the code.

This separation also means teams that already use a requirements process can
plug speq in without changing how they write PRDs — just drop the document
in and run enrich.

## Why docs are written per scenario, not at the end

Documentation written after the fact is always incomplete because the
implementer has moved on mentally. The details of edge cases, error
conditions, and authorization rules fade quickly once the code is passing
tests and the developer is thinking about the next task.

Writing docs as part of the Verify → Docs → Refactor cycle means every
public surface is documented at the moment it is created, while the intent
is still clear. Each scenario produces a small, focused documentation
update rather than a large, dreaded "write all the docs" task at the end.

The verify gate enforces this — `docs/api.md` completeness is a hard gate
that blocks shipping. This makes documentation a first-class deliverable,
not an afterthought.

## Why the Verify sub-task re-reads GIVEN/WHEN/THEN before closing

A test can pass without actually covering the acceptance criterion that
generated it. This happens more often than you would expect: a test might
check the happy path but skip the `AND` clause, or assert on a status code
without verifying the response body matches what the scenario specified.

The Verify step makes this explicit. Each clause of the scenario —
GIVEN, WHEN, THEN, and AND — is checked against what the test actually
asserts before the sub-task closes. This catches tests that are green but
incomplete, preventing false confidence in coverage.

## Why implement loops autonomously until all tasks are closed

Asking "should I continue?" after each task shifts the burden back to the
user and breaks the deep focus needed for TDD. Every interruption requires
the user to context-switch, evaluate progress, and give permission —
adding friction without adding value.

The loop exit condition is explicit: `bd list --status open` returns empty.
This means Claude has a clear, verifiable stopping criterion that does not
depend on human prompting. The user is free to step away and return to a
completed implementation, or watch the progress in real time and intervene
only when something goes wrong.

## Why security scenarios are mandatory at P0

Security requirements are routinely the last thing specified and the first
thing cut when schedules slip. Teams plan to "add security later" but later
never comes — or comes after an incident.

Making security scenarios mandatory in every spec — with P0 priority so they
block everything else — means they cannot be deferred. The security test is
the first test written for any capability, and the implementation must pass
it before any functional work begins.

If a spec writer cannot identify a relevant security scenario, that is itself
a signal that the threat model needs work. The constraint forces the
conversation early, when it is cheapest to address.
