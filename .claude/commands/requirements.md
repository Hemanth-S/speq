---
description: Gather requirements via Working Backwards conversation, grounded in the existing codebase, then produce a named PRD file
---

You are running a Working Backwards requirements session for a new feature.
Follow every step in order. Do not skip steps or combine phases.

## Step 0 — Read caveman mode config

Read the `<!-- BEGIN SPEQ -->` block in CLAUDE.md. Look for:
  caveman.prd: on|off

If CLAUDE.md is missing or has no caveman config, default to: caveman.prd: on

Remember this setting — you will use it in Step 3.

## Step 1 — Lightweight codebase scan

Before asking the user a single question, do a **lightweight scan only**:

  find . -not -path '*/.git/*' -not -path '*/node_modules/*' \
         -not -path '*/__pycache__/*' -not -path '*/dist/*' \
         -not -path '*/.next/*' -not -path '*/.beads/*' \
         -not -path '*/coverage/*' | sort | head -120

Then read (if they exist):
  - README.md or readme.md
  - CLAUDE.md

Build an internal map of the project structure (do not show this to the user).
**Do NOT read schemas, routes, env vars, or service files yet.**
You will pull deeper context on demand in Step 2 when a question requires it.

## Step 2 — Multi-turn requirements conversation

Ask ONE or TWO focused questions per turn. Wait for the user's answer
before continuing. Never dump all questions at once. Adapt based on answers.

### On-demand deep scanning

When a question requires codebase context you don't have yet, scan the
relevant artifacts at that point:

  - **Database question** → read schema files: *.sql, schema.prisma,
    models.py, *.graphql, openapi.yaml, swagger.json, db/migrate/*,
    alembic/versions/*
  - **API question** → read route/handler files: routes/*, controllers/*,
    handlers/*, pages/api/*, app/api/*, server.go, app.py, main.go
  - **Config question** → grep for env var patterns:
      grep -rn "process\.env\|os\.environ\|os\.getenv\|viper\.Get" \
        --include="*.js" --include="*.ts" --include="*.py" --include="*.go" \
        . 2>/dev/null | grep -v ".git/" | grep -v "node_modules/" | head -40
  - **Service/module question** → read top-level source files (skip tests)

Do not re-scan artifacts you have already read in this conversation.

Grounding rule: whenever you reference a table, endpoint, or service,
name it explicitly so the user can confirm or correct it.
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

Any value you have to assume (not stated by the user or found in code)
must be marked: <!-- ASSUMPTION: <reasoning> — validate with stakeholder -->

### If caveman.prd is ON:

Write TWO files:

**`prd-<name>.md`** — Compressed format for Claude consumption:
- Section headers abbreviated (e.g. "## Reqs" not "## Functional Requirements")
- Tables omit empty columns
- Prose is single-line fragments, not paragraphs
- FR/NFR entries are one line each, no "The system SHALL" preamble
- Threat model and failure mode tables use terse cell values
- All FR-N IDs, NFR-* IDs, table names, endpoint paths preserved exactly

**`prd-<name>.readable.md`** — Full verbose format for human review:
- Uses the standard PRD template below with complete prose

### If caveman.prd is OFF:

Write ONE file: `prd-<name>.md` using the standard verbose template below.

### Standard verbose PRD template

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

### Compressed PRD example

For reference, here is how the compressed format looks:

```markdown
# Widget Export PRD

## Problem
Admins need bulk CSV export of widget data. Currently manual — takes 2h/week.

## Goals
- One-click export of filtered widget data as CSV
- < 5s for up to 100k rows

## Non-Goals
- Real-time streaming export
- PDF/Excel formats

## Codebase
Reads: widgets (id, name, org_id, created_at), widget_tags (widget_id, tag)
Extends: GET /api/v2/widgets — add ?format=csv query param
Reuses: AuthMiddleware (routes/auth.go), CSVWriter (lib/csv.go)
New: ExportJob table (id, org_id, status, file_path, created_at) — async for large exports

## Reqs
- FR-1: GET /api/v2/widgets?format=csv returns CSV with headers matching column names
- FR-2: Export respects existing filter params (status, tag, date range)
- FR-3: Exports > 10k rows run async — return 202 with job ID
- FR-4: GET /api/v2/exports/:id returns job status and download URL

## NFRs
- PERF: < 5s for 100k rows, < 200ms for < 1k rows
- SEC: Org-scoped — user can only export own org's widgets

## Security
| Threat | L | I | Mitigation |
|--------|---|---|------------|
| IDOR on export job | M | H | Verify org_id matches caller |
| CSV injection | L | M | Prefix cells starting with =+-@ with single quote |

## Failure Modes
| Dep | Scenario | Detection | Degraded | Recovery |
|-----|----------|-----------|----------|----------|
| DB | Query timeout on large export | Context deadline exceeded | Return 503, suggest smaller filter | Retry with backoff |

## Done
- [ ] All FRs tested
- [ ] Coverage >= 80%/70%
- [ ] CSV injection test for =+-@ prefixes
```

After writing the PRD file(s), tell the user:
"PRD written to prd-<name>.md. Review it, make any edits, then run
/spec — or /ship to run the full pipeline."
If caveman mode produced a readable sidecar, also mention:
"Human-readable version: prd-<name>.readable.md"
