---
description: Gather requirements via Working Backwards conversation, grounded in the existing codebase, then produce a named PRD file
---

You are running a Working Backwards requirements session for a new feature.
Follow every step in order. Do not skip steps or combine phases.

## Step 1 — Scan the codebase first

Before asking the user a single question, explore the project thoroughly.
Run these in sequence:

  find . -not -path '*/.git/*' -not -path '*/node_modules/*' \
         -not -path '*/__pycache__/*' -not -path '*/dist/*' \
         -not -path '*/.next/*' | sort | head -120

Then read:
  - README.md or readme.md if present
  - Any CLAUDE.md or AGENTS.md
  - Schema files: *.sql, schema.prisma, models.py, *.graphql,
    openapi.yaml, swagger.json, db/migrate/*, alembic/versions/*
  - Route/API files: routes/*, controllers/*, handlers/*,
    pages/api/*, app/api/*, server.go, app.py, main.go
  - Top-level service and module files (skip test files)
  - Environment variable usage:
      grep -rn "process\.env\|os\.environ\|os\.getenv\|viper\.Get" \
        --include="*.js" --include="*.ts" --include="*.py" --include="*.go" \
        . 2>/dev/null | grep -v ".git/" | grep -v "node_modules/" | head -40

Build an internal map (do not show this to the user) covering:
  - Language, framework, test runner
  - All database tables/collections with key columns and types
  - All existing API endpoints: method, path, auth requirement, purpose
  - All services/modules and what they own
  - Conventions: error handling, auth middleware, validation libraries,
    logging approach, test patterns
  - All environment variables in use

## Step 2 — Multi-turn requirements conversation

Ask ONE or TWO focused questions per turn. Wait for the user's answer
before continuing. Never dump all questions at once. Adapt based on answers.

Grounding rule: whenever you reference a table, endpoint, or service from
your Step 1 scan, name it explicitly so the user can confirm or correct it.
Example: "I can see you have a `users` table with an `org_id` column —
should this feature scope data to the organisation, or is it user-level?"

Cover these topics in roughly this order:
  1. What capability or problem needs solving?
  2. Who is the user and what is the exact job-to-be-done?
  3. How does this interact with the existing schema and APIs you found?
     Ask the user to confirm or correct your understanding.
  4. Scale: users, data volume, peak load today and in 18 months.
  5. Security: authentication/authorization model. Does this touch PII,
     financial data, or other sensitive categories?
  6. Availability: acceptable downtime? Graceful degradation if a
     dependency fails?
  7. Success metrics: how will the user know this is working a month
     after launch?
  8. Biggest risks: technical, security, or operational.

When you have clear answers to all eight areas, say:
"I have enough to write the PRD. Shall I generate it now?"
Wait for confirmation before proceeding.

## Step 3 — Write the PRD file

Generate a short, kebab-case name from the feature (e.g. `prd-webhook-delivery.md`,
`prd-user-invite-flow.md`, `prd-billing-usage-alerts.md`). The name should be
2-4 words that capture the core capability — not a generic label.

Write the PRD to the project root using this generated filename.
Populate every section — do not leave placeholders.
Any value you have to assume (not stated by the user or found in code)
must be marked: <!-- ASSUMPTION: <reasoning> — validate with stakeholder -->

---
# <Feature Name> PRD

## Problem Statement
[Who has the problem, what it is, what the impact is]

## Goals
- [Specific and measurable]

## Non-Goals
- [Explicit exclusions to prevent scope creep]

## Codebase Integration

### Existing tables/collections this feature reads or writes
| Table/Collection | Operation | Key columns used | Notes |
|-----------------|-----------|-----------------|-------|

### Existing APIs this feature calls or extends
| Method | Path | Auth required | Purpose |
|--------|------|--------------|---------|

### Existing services/modules to reuse
| Service/Module | What it provides | Path |
|---------------|-----------------|------|

### New tables, columns, or endpoints required
| Type | Name | Purpose | Why not reusing existing |
|------|------|---------|--------------------------|

## Customer Experience
[Short narrative: user journey for the primary happy path,
using real UI or API surface from the codebase]

## Functional Requirements
- FR-1: The system SHALL ...
- FR-2: ...

## Non-Functional Requirements
- NFR-PERF:  P99 latency < Xms under Y RPS sustained load
- NFR-AVAIL: 99.X% uptime; RTO < X min; RPO < X min
- NFR-SCALE: X concurrent users / Y GB stored data
- NFR-SEC:   [auth mechanism, encryption at rest and in transit, data classification]

## Security & Compliance

### Threat Model
| Threat | Likelihood | Impact | Mitigation |
|--------|-----------|--------|------------|

### Data Classification
[What is stored, sensitivity level, retention policy]

### Authentication & Authorization
[Mechanism from codebase — e.g. JWT via middleware at routes/auth.go]
[Authorization model: RBAC / ABAC / ownership-check / etc.]

## Operational Requirements

### Metrics to emit
- Latency histogram for each new endpoint (P50, P95, P99)
- Error rate counter by error type
- [Domain-specific metrics implied by the feature]

### Alarm conditions
- Error rate > X% over 5 minutes → page on-call
- P99 latency > Xms sustained for 3 minutes → page on-call

### Runbook sketch
[Step-by-step for the two most likely failure modes]

## Failure Modes
| Dependency | Failure scenario | Detection | Degraded behavior | Recovery |
|------------|-----------------|-----------|-------------------|----------|

## Definition of Done
- [ ] All functional requirements implemented and tested
- [ ] P99 latency verified under load per NFR-PERF
- [ ] Security scan: 0 high/critical findings
- [ ] Line coverage ≥ 80%, branch coverage ≥ 70%
- [ ] All new public functions/endpoints documented inline
- [ ] API reference updated in docs/
- [ ] Runbook reviewed by one other person
- [ ] Rollback plan documented or feature flagged

## Open Questions
- [Anything a tech lead would block the design review on]
---

After writing the PRD file, tell the user:
"PRD written to prd-<name>.md. Review it, make any edits, then run
/spec — or /ship to run the full pipeline."
