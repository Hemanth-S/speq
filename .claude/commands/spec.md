---
description: Convert a PRD file into OpenSpec files — one per capability — with mandatory security, failure, idempotency, and performance scenarios
---

You are generating OpenSpec specification files from a PRD.
Follow every step in order.

## Step 1 — Read inputs

Locate the PRD file. Check in this order:
  1. If the user specified a filename (e.g. `/spec my-feature-prd.md`),
     use that file.
  2. Otherwise, look for any `prd-*.md` file in the project root. If exactly
     one exists, use it. If multiple exist, list them and ask the user which
     one to use.
  3. Fall back to `PRD.md` if it exists.
  4. If none found: stop and tell the user to create a PRD first
     (`/requirements`) or place one in the project root.

Read the PRD file fully. Pay particular attention to:
  - The Codebase Integration section (real table and API names to use in scenarios)
  - The NFRs (needed for performance scenarios)
  - The Threat Model (needed for security scenarios)
  - The Failure Modes table (needed for degradation scenarios)

If the Codebase Integration section is missing or mostly empty, run
the codebase scan from /enrich Step 2 before continuing.

## Step 2 — Identify capabilities and confirm

From the PRD identify distinct capabilities. Each capability must:
  - Have a single clear purpose
  - Map to one domain area of the codebase
  - Be buildable and testable independently (or with explicit dependencies)

Output the list of capabilities you identified, e.g.:
  - user-auth-token-refresh
  - invoice-pdf-generation
  - webhook-delivery

Ask the user: "Do these capabilities look right? Reply yes to generate
the specs, or tell me what to change."
Wait for confirmation.

## Step 3 — Write one spec.md per capability

For each capability, create openspec/specs/<capability-name>/spec.md.

Mandatory scenario checklist — every spec MUST include at minimum:
  1. [P0] One security scenario: authentication failure, authorization
     bypass, or malicious/oversized input (pick the most relevant threat
     from the PRD's threat model).
  2. [P2] One failure/degradation scenario: what happens when a dependency
     (database, cache, external API) is unavailable or times out.
  3. [P1] One idempotency scenario for EVERY operation that mutates state:
     the same request sent twice produces the same result with no
     duplicate side effects.
  4. [P1] One performance scenario tied to the NFRs, if latency or
     throughput targets are defined in the PRD.

If you cannot include all four for a given spec, add:
  <!-- TODO: clarify — missing <type> scenario because <reason> -->

Use real table names, column names, and API paths from the Codebase
Integration section of the PRD wherever possible. Scenarios must be
concrete and testable — no vague language like "works correctly" or
"returns an error".

Use exactly this format for every spec file:

---
# <capability-name> Specification

## Purpose
[One or two sentences: what this capability does and why it exists.]

## Codebase references
- Tables/collections: [real names]
- APIs called or extended: [real method + path]
- Services/modules reused: [real names and paths]
- New schema required: [if any, else "none"]

## Requirements

### Requirement: <Requirement Name>
The system SHALL <concise, testable requirement statement>.

#### Scenario: <Scenario Name> [P0|P1|P2|P3]
- GIVEN <concrete initial context using real field names>
- WHEN  <specific triggering event>
- THEN  <exact, measurable expected outcome>
- AND   <additional outcome if needed>

<!-- Repeat Scenarios per Requirement -->
<!-- Repeat Requirements per capability -->
---

## Step 4 — Output summary

After writing all spec files, output:

| Capability | Requirements | Scenarios | Security? | Failure? | Idempotency? | Perf? |
|-----------|-------------|-----------|----------|---------|-------------|------|

Tell the user: "Specs written to openspec/specs/. Review them, then run
/plan — or /ship to continue the full pipeline."
