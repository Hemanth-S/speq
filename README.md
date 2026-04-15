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

## Two ways to use speq

### CLI (recommended)

```bash
npm install -g speq
speq init
```

Then from your terminal:
```bash
speq requirements    # gather requirements interactively
speq ship            # run the full pipeline
speq ship --from=implement  # resume from a specific phase
speq resume          # auto-detect where you left off
```

### Slash commands inside Claude Code

If you prefer to stay inside a Claude Code session, use the slash commands
directly. `speq init` copies them to `.claude/commands/` for you.

```
/requirements
/ship
```

> **Note on command names.** Older versions of Claude Code required a
> `/project:` prefix for project-scoped commands (e.g. `/project:ship`).
> Current versions discover commands in `.claude/commands/*.md` and
> invoke them with the bare name (`/ship`). If `/ship` isn't found,
> type `/` at the Claude Code prompt and check the autocomplete list
> to see how your version has registered the command.

## Command reference

| CLI command | Slash command | What it does | Output |
|-------------|---------------|-------------|--------|
| `speq requirements` | `/requirements` | Working Backwards requirements conversation grounded in the codebase | `prd-<feature-name>.md` |
| `speq enrich` | `/enrich` | Grounds a vague PRD in real tables, APIs, and services | Updated PRD with codebase integration |
| `speq spec` | `/spec` | Converts PRD into OpenSpec files with mandatory scenario types | `openspec/specs/*/spec.md` |
| `speq plan` | `/plan` | Translates specs into a Beads task graph with TDD sub-tasks | `bd` epics, tasks, and sub-tasks |
| `speq implement` | `/implement` | Autonomous TDD loop — writes tests, implements, verifies, documents | Working code with tests and docs |
| `speq verify` | `/verify` | Seven-gate pre-ship check (tests, coverage, security, docs, etc.) | Pass/fail report |
| `speq done` | `/done` | Reconciles specs with implementation, finalizes docs, archives | Closed feature cycle |
| `speq ship` | `/ship` | Full pipeline: enrich → spec → plan → implement → verify → done | Complete shipped feature |

### Pipeline control

| CLI command | What it does |
|-------------|-------------|
| `speq ship --from=<phase>` | Skip completed phases and resume from a specific point |
| `speq resume` | Auto-detect pipeline state from project artifacts and resume |
| `speq init` | Scaffold a project for speq (copy commands, amend CLAUDE.md, init Beads) |

## What speq enforces

1. **Codebase is scanned before requirements are gathered or enriched.** Every PRD references real column names, real endpoints, and real service boundaries — not invented ones.

2. **Every spec must include security, failure, idempotency, and performance scenarios.** Security is P0 and blocks all other work. You cannot defer it.

3. **Acceptance criteria are cross-checked clause-by-clause before any task is closed.** The Verify sub-task re-reads GIVEN/WHEN/THEN from the spec and confirms each clause is asserted in the test.

4. **Documentation is written per scenario during implementation — enforced as a hard gate in `/verify`.** Docs are not an afterthought; they are a shipping requirement.

## Quick start

1. Install [Claude Code](https://claude.ai/code)

2. Install speq and its dependencies:
   ```bash
   # Option A: setup script (checks and installs everything)
   curl -sL https://raw.githubusercontent.com/Hemanth-S/speq/main/setup.sh | bash

   # Option B: manual install
   npm install -g github:Hemanth-S/speq
   npm install -g @beads/bd
   ```

3. Initialise speq in your project:
   ```bash
   cd /path/to/your-project
   speq init
   ```
   This copies command files to `.claude/commands/`, amends `CLAUDE.md`
   with speq instructions, and runs `bd init`.

4. Start building:
   ```bash
   speq requirements   # gather requirements interactively
   speq ship           # run the full pipeline from PRD to shipped feature
   ```

   Or from inside Claude Code, use the slash commands directly:
   ```
   /requirements
   /ship
   ```

See [docs/install.md](docs/install.md) for detailed setup instructions.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to propose changes, test them,
and submit a PR.

## License

MIT — see [LICENSE](LICENSE).
