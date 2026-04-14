---
description: Take an existing PRD written without codebase awareness and make it implementation-ready
---

You are grounding an existing PRD in the real codebase and filling any
gaps before specs are generated. Follow every step in order.

## Step 1 — Confirm PRD.md exists

Check that PRD.md exists in the project root.
If it does not: stop and tell the user to place their PRD at PRD.md and re-run.

Read PRD.md fully. While reading, note every place where:
  - A table, collection, or field name is mentioned vaguely or is absent
  - An API endpoint is mentioned vaguely ("the user API") without a real path
  - An integration is referenced without a concrete technical anchor
  - An NFR is missing or uses placeholder values like "fast" or "scalable"
  - Security requirements are vague or absent
  - A failure mode is not addressed
  - Any assumption is stated as fact without evidence

Keep this gap list internally — you will fill every gap in Step 3.

## Step 2 — Scan the codebase

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
    pages/api/*, app/api/*, server.go, app.py
  - Top-level service and module files (skip test files)
  - Environment variable usage:
      grep -rn "process\.env\|os\.environ\|os\.getenv\|viper\.Get" \
        --include="*.js" --include="*.ts" --include="*.py" --include="*.go" \
        . 2>/dev/null | grep -v ".git/" | grep -v "node_modules/" | head -40
  - Existing auth middleware — find where authentication is enforced
  - Existing error handling patterns — how errors are returned to callers

Build an internal map covering:
  - Language, framework, test runner
  - All database tables/collections with key columns and types
  - All existing API endpoints: method, path, auth requirement, purpose
  - All services/modules and what they own
  - Auth mechanism, authorization model
  - Conventions: error handling, validation, logging, test patterns
  - All environment variables in use

## Step 3 — Enrich PRD.md

Update PRD.md in place. Do not rewrite sections that are already complete
and accurate. Add or correct only what is missing or wrong.

### 3a — Add or complete: Codebase Integration

Replace or add this section:

## Codebase Integration

### Existing tables/collections this feature reads or writes
| Table/Collection | Operation | Key columns used | Notes |
|-----------------|-----------|-----------------|-------|
[Use real names from your scan. Note multi-tenancy constraints, soft-delete
columns, or other gotchas relevant to the feature.]

### Existing APIs this feature calls or extends
| Method | Path | Auth required | Purpose |
|--------|------|--------------|---------|
[Use real methods and paths.]

### Existing services/modules to reuse
| Service/Module | What it provides | Path |
|---------------|-----------------|------|

### New tables, columns, or endpoints required
| Type | Name | Purpose | Why not reusing existing |
|------|------|---------|--------------------------|

### 3b — Fill missing or vague NFRs

Add concrete values. If you must assume, mark it:
<!-- ASSUMPTION: <reasoning> — validate with stakeholder -->

Pattern:
  NFR-PERF:  P99 latency < Xms under Y RPS
  NFR-AVAIL: 99.X% uptime; RTO < X min; RPO < X min
  NFR-SCALE: X concurrent users / Y GB stored data
  NFR-SEC:   [auth mechanism, encryption, data classification]

### 3c — Fill missing security requirements

If the PRD lacks a Security & Compliance section, add:

## Security & Compliance

### Threat Model
| Threat | Likelihood | Impact | Mitigation |
|--------|-----------|--------|------------|
[At minimum: auth bypass, injection (SQL/NoSQL/command), data exfiltration,
and any threat specific to the feature domain.]

### Data Classification
[What is stored, sensitivity level: public/internal/confidential/restricted,
retention policy]

### Authentication & Authorization
[Name the actual mechanism found in the codebase and where it is enforced.
Name the authorization model: RBAC / ABAC / ownership-check / etc.]

### 3d — Fill missing operational requirements

If missing, add:

## Operational Requirements

### Metrics to emit
- Latency histogram for each new endpoint (P50, P95, P99)
- Error rate counter by error type and status code
- [Any domain-specific metric implied by the feature]

### Alarm conditions
- Error rate > X% over 5 minutes → page on-call
- P99 latency > Xms sustained for 3 minutes → page on-call

### Runbook sketch
[Step-by-step recovery for the two most likely failure modes]

### 3e — Fill missing failure modes

If absent or incomplete, add:

## Failure Modes
| Dependency | Failure scenario | Detection | Degraded behavior | Recovery |
|------------|-----------------|-----------|-------------------|----------|
[Cover every external dependency the feature touches.]

### 3f — Add Definition of Done if missing

## Definition of Done
- [ ] All functional requirements implemented and tested
- [ ] P99 latency verified under load per NFR-PERF
- [ ] Security scan: 0 high/critical findings
- [ ] Line coverage ≥ 80%, branch coverage ≥ 70%
- [ ] All new public functions/endpoints documented inline
- [ ] API reference updated in docs/
- [ ] Runbook reviewed by one other person
- [ ] Rollback plan documented or feature flagged

## Step 4 — Flag conflicts and ambiguities

For anything in the PRD that is contradicted by the codebase, technically
infeasible as stated, or underspecified to a degree that would cause
incompatible implementation choices, add an inline comment:

  <!-- CONFLICT: <description> — needs stakeholder decision -->
  <!-- UNDERSPECIFIED: <description> — clarify before spec -->

## Step 5 — Present the enrichment summary

Output a table:

| Section | Was | Action taken |
|---------|-----|--------------|
| Codebase Integration | missing/partial/present | added/completed/unchanged |
| NFRs | missing/vague/present | added N targets / marked N assumptions |
| Threat Model | missing/partial/present | added/completed/unchanged |
| Failure Modes | missing/partial/present | added N rows |
| Definition of Done | missing/present | added/unchanged |
| Conflicts flagged | — | N |
| Assumptions marked | — | N |

Then list every <!-- CONFLICT --> and <!-- UNDERSPECIFIED --> comment
and ask the user to resolve each one.

If there are none: tell the user "PRD is enriched and ready.
Run /project:spec to generate specs, or /project:ship to run the full pipeline."
