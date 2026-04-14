# speq

Spec-driven TDD development workflow for Claude Code. speq is a set of eight
slash commands that take you from a blank slate (or an existing PRD) to a
fully implemented, tested, documented, and verified feature — with every step
grounded in your actual codebase.

The problem: AI coding assistants write code without understanding your
existing architecture, skip tests, ignore security, and leave documentation
as an afterthought. speq enforces a disciplined workflow where requirements
reference real tables and APIs, every feature has security and failure
scenarios, tests are written before code, and documentation is a hard gate
— not a nice-to-have.

## Two starting points

**Starting from scratch:**
```
/project:requirements
```
Then when the PRD is ready:
```
/project:ship
```

**Starting from an existing PRD:**
Drop your `PRD.md` in the project root, then:
```
/project:ship
```

## Command reference

| Command | What it does | Output |
|---------|-------------|--------|
| `/project:requirements` | Working Backwards requirements conversation grounded in the codebase | `PRD.md` |
| `/project:enrich` | Grounds a vague PRD in real tables, APIs, and services | Updated `PRD.md` with codebase integration |
| `/project:spec` | Converts PRD into OpenSpec files with mandatory scenario types | `openspec/specs/*/spec.md` |
| `/project:plan` | Translates specs into a Beads task graph with TDD sub-tasks | `bd` epics, tasks, and sub-tasks |
| `/project:implement` | Autonomous TDD loop — writes tests, implements, verifies, documents | Working code with tests and docs |
| `/project:verify` | Seven-gate pre-ship check (tests, coverage, security, docs, etc.) | Pass/fail report |
| `/project:done` | Reconciles specs with implementation, finalizes docs, archives | Closed feature cycle |
| `/project:ship` | Full pipeline: enrich → spec → plan → implement → verify → done | Complete shipped feature |

## What speq enforces

1. **Codebase is scanned before requirements are gathered or enriched.** Every PRD references real column names, real endpoints, and real service boundaries — not invented ones.

2. **Every spec must include security, failure, idempotency, and performance scenarios.** Security is P0 and blocks all other work. You cannot defer it.

3. **Acceptance criteria are cross-checked clause-by-clause before any task is closed.** The Verify sub-task re-reads GIVEN/WHEN/THEN from the spec and confirms each clause is asserted in the test.

4. **Documentation is written per scenario during implementation — enforced as a hard gate in `/project:verify`.** Docs are not an afterthought; they are a shipping requirement.

## Quick start

1. Install [Claude Code](https://claude.ai/code)

2. Clone speq and copy commands into your project:
   ```bash
   git clone https://github.com/<your-username>/speq.git
   cp -r speq/.claude /path/to/your-project/
   cp speq/CLAUDE.md /path/to/your-project/
   ```

3. Install Beads (task tracker):
   ```bash
   npm install -g @beads/bd
   ```

4. Open your project in Claude Code

5. Run your first command:
   ```
   /project:requirements
   ```

See [docs/install.md](docs/install.md) for detailed setup instructions.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to propose changes, test them,
and submit a PR.

## License

MIT — see [LICENSE](LICENSE).
