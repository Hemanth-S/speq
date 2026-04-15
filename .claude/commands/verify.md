---
description: Pre-ship gate check — every gate must pass before merging or releasing
---

You are running a release readiness check.
Evaluate every gate below in order.
For each gate output one of: ✅ PASS | ❌ FAIL | ⏭ SKIP

SKIP requires a written justification. A single ❌ FAIL blocks shipping.
Do not output "SHIP IT" until every applicable gate shows ✅ PASS.

## Gate 1 — All Beads tasks closed

  Run: bd list --status open
  ✅ PASS: output is empty
  ❌ FAIL: list every open task — tell the user to finish them first

## Gate 2 — Test suite

  Detect the test runner from existing config or test files.
  Run the full suite:
    npm test        (Node/JS/TS projects)
    python -m pytest -v   (Python projects)
    go test ./...   (Go projects)
  ✅ PASS: 0 failures, 0 errors
  ❌ FAIL: list every failing test with its assertion message

## Gate 3 — Coverage

  Run coverage alongside the test suite.
    JS/TS: jest --coverage or vitest --coverage
    Python: pytest --cov --cov-report=term-missing
    Go: go test ./... -cover
  ✅ PASS: line coverage ≥ 80% AND branch coverage ≥ 70%
  ❌ FAIL: show actual percentages and which files are below threshold
  ⏭ SKIP: no coverage tooling configured — note this and recommend adding it

## Gate 4 — Dependency audit

  npm projects:    npm audit --audit-level=high
  Python projects: pip-audit (install if missing: pip install pip-audit)
  Go projects:     govulncheck ./... (install if missing:
                     go install golang.org/x/vuln/cmd/govulncheck@latest)
  ✅ PASS: 0 high or critical CVEs
  ❌ FAIL: list each finding with CVE ID, severity, and package name

## Gate 5 — Secrets scan

  grep -rn \
    -e "password\s*=" -e "api_key\s*=" -e "secret\s*=" \
    -e "private_key\s*=" -e "BEGIN RSA PRIVATE" \
    -e "BEGIN EC PRIVATE" -e "AKIA[A-Z0-9]\{16\}" \
    --include="*.js" --include="*.ts" --include="*.py" \
    --include="*.go" --include="*.rb" --include="*.env" \
    . 2>/dev/null | grep -v ".git/" | grep -v "node_modules/" \
    | grep -v "__pycache__/" | grep -v "test\|spec\|mock\|fixture"

  ✅ PASS: no matches (or only matches in test fixtures using obviously fake values)
  ❌ FAIL: list every match with file path and line number

## Gate 6 — Documentation completeness

  Check each of the following. Report each as present or missing:
    □ Every new public function/method has a docstring or JSDoc block
    □ Every new API endpoint appears in docs/api.md
    □ Every new environment variable appears in README.md
    □ CHANGELOG.md has an entry for this feature
    □ Setup/installation changes reflected in docs/install.md (if applicable)
    □ New user workflows or edge cases added to docs/faq.md (if applicable)
    □ Development/testing workflow changes reflected in CONTRIBUTING.md (if applicable)

  ✅ PASS: all present
  ❌ FAIL: list exactly what is missing and in which file

## Gate 7 — No untracked TODOs

  grep -rn "TODO\|FIXME\|HACK\|XXX" \
    --include="*.js" --include="*.ts" --include="*.py" --include="*.go" \
    . 2>/dev/null | grep -v ".git/" | grep -v "node_modules/" \
    | grep -v "bd-[a-z0-9]"

  ✅ PASS: no matches, or every match already references a bd task ID
  ❌ FAIL: list each untracked item — user must add a bd task reference
           or resolve it inline before shipping

## Final verdict

If all applicable gates are ✅ PASS:
  Print: "✅ SHIP IT — all gates passed."

If any gate is ❌ FAIL:
  Print: "❌ NOT READY — resolve the following before shipping:"
  List each failing gate with a one-line description of what must be fixed.
