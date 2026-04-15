# Caveman Mode PRD

## Problem Statement
speq's prompts, PRDs, OpenSpec scenarios, and Beads task descriptions are
verbose by design. This verbosity is re-read many times during a `/ship`
pipeline — specs are read per-task during implement (B-1, B-3), PRDs are
read during enrich/spec/plan, and Beads descriptions are read via
`bd list`/`bd show`/`bd ready` throughout the implement loop. The
cumulative token cost is significant and can push long sessions into
context compaction, losing earlier context.

Additionally, the `/requirements` and `/enrich` commands perform a full
upfront codebase scan (file tree, README, schemas, routes, env vars)
before asking the first question. Much of this scan output is never
referenced. A lazy approach — lightweight initial scan, deeper pulls
on demand — would save tokens without sacrificing grounding quality.

## Goals
- Reduce token usage across the `/ship` pipeline by compressing artifact
  text (PRDs, OpenSpec scenarios, Beads tasks) while preserving precision
- Make compression configurable per artifact type with a CLI interface
- Eliminate wasteful upfront codebase scanning; scan lazily instead
- Generate a human-readable PRD sidecar when caveman mode compresses PRDs

## Non-Goals
- Changing the structure or sections of PRDs, specs, or task graphs
- Compressing prompt files themselves (`.claude/commands/*.md`)
- Removing any information — only reformatting for brevity
- Changing the TDD loop, verify gates, or done checklist

## Codebase Integration

### Existing tables/collections this feature reads or writes
| Table/Collection | Operation | Key columns used | Notes |
|-----------------|-----------|-----------------|-------|
| N/A | N/A | N/A | Local CLI, no database |

### Existing APIs this feature calls or extends
| Method | Path | Auth required | Purpose |
|--------|------|--------------|---------|
| N/A | N/A | N/A | No network APIs |

### Existing services/modules to reuse
| Service/Module | What it provides | Path |
|---------------|-----------------|------|
| `cli.ts` | Argument parsing, command routing, COMMANDS list | `src/cli.ts` |
| `init.ts` | `amendClaudeMd()` writes `<!-- BEGIN SPEQ -->` block to CLAUDE.md | `src/init.ts` |
| `index.ts` | Main entry point, command dispatch | `src/index.ts` |
| `runner.ts` | `runCommand()` spawns claude safely, `getPromptFilePath()` | `src/runner.ts` |
| CLAUDE.md speq block | `SPEQ_INSTRUCTIONS` constant in `init.ts` — config will be appended here | `src/init.ts` |

### New tables, columns, or endpoints required
| Type | Name | Purpose | Why not reusing existing |
|------|------|---------|--------------------------|
| Module | `src/config.ts` | Read/write caveman config in CLAUDE.md speq block | No config module exists |
| CLI command | `speq config` | Get/set caveman mode settings from terminal | No config command exists |

## Customer Experience

**Configuring caveman mode:**
```bash
speq config                           # show all settings
speq config caveman.prd on            # compress PRDs + generate readable sidecar
speq config caveman.openspec off      # verbose OpenSpec scenarios
speq config caveman.beads on          # terse Beads task descriptions
speq config caveman --all on          # everything compressed
```

The config command reads the `<!-- BEGIN SPEQ -->` block in CLAUDE.md,
updates the relevant setting, and writes it back. Settings are stored as
a YAML-like block inside the speq markers so prompts can read them at
runtime.

**Running requirements with caveman mode on:**
```bash
speq requirements
```
Produces:
- `prd-<name>.md` — compressed PRD (Claude reads this during /ship)
- `prd-<name>.readable.md` — verbose human-readable version

**Running /ship with caveman mode:**
OpenSpec scenarios use compressed format. Beads task titles and
descriptions are terse. Claude reads less text per task cycle.

**Lazy codebase scanning:**
`/requirements` does a lightweight scan first (file tree + README only),
then pulls deeper context (schemas, routes, env vars) only when a
question requires it.

## Functional Requirements

- FR-1: The system SHALL store caveman mode settings in the `<!-- BEGIN SPEQ -->` / `<!-- END SPEQ -->` block of CLAUDE.md as a config section readable by prompts.
- FR-2: The system SHALL support three independent settings: `caveman.prd`, `caveman.openspec`, `caveman.beads`, each accepting `on` or `off`.
- FR-3: All three settings SHALL default to `on` when `speq init` creates the speq block.
- FR-4: The `speq config` command SHALL display all current settings when called with no arguments.
- FR-5: The `speq config <key> <value>` command SHALL update the specified setting in CLAUDE.md.
- FR-6: The `speq config caveman --all <value>` command SHALL set all three caveman settings at once.
- FR-7: The `speq config` command SHALL validate that keys are known and values are `on` or `off`, printing an error for invalid input.
- FR-8: When `caveman.prd` is `on`, the `/requirements` command SHALL produce a compressed `prd-<name>.md` and a verbose `prd-<name>.readable.md` side by side.
- FR-9: When `caveman.prd` is `off`, the `/requirements` command SHALL produce only the standard verbose `prd-<name>.md`.
- FR-10: When `caveman.openspec` is `on`, the `/spec` command SHALL output compressed OpenSpec scenarios using the terse format (abbreviated GIVEN/WHEN/THEN, no boilerplate, ~40% fewer tokens).
- FR-11: When `caveman.openspec` is `off`, the `/spec` command SHALL output the standard verbose OpenSpec format.
- FR-12: When `caveman.beads` is `on`, the `/plan` command SHALL generate terse Beads task titles and descriptions.
- FR-13: When `caveman.beads` is `off`, the `/plan` command SHALL generate standard verbose task descriptions.
- FR-14: The `/requirements` command SHALL perform only a lightweight initial scan (file tree and README/CLAUDE.md) before starting the conversation.
- FR-15: The `/requirements` command SHALL scan deeper codebase artifacts (schemas, routes, env vars, service files) only when a conversation question requires that context.
- FR-16: The `/enrich` command SHALL follow the same lazy scanning pattern as `/requirements`.
- FR-17: The `speq init` command SHALL include default caveman config (`caveman.prd: on`, `caveman.openspec: on`, `caveman.beads: on`) in the speq block when creating or updating CLAUDE.md.
- FR-18: The `speq config` command SHALL preserve all existing content in CLAUDE.md outside the speq markers.
- FR-19: The compressed format SHALL preserve all machine-actionable information (requirement IDs, scenario priorities, GIVEN/WHEN/THEN clauses, table names, endpoint paths) — only boilerplate prose is removed.

## Non-Functional Requirements
- NFR-PERF: `speq config` completes in < 100ms (file read + write, no network).
- NFR-SEC: Config values are stored in a committed file (CLAUDE.md). No secrets involved. `speq config` uses the same `amendClaudeMd()` pattern — no shell injection risk.

## Security & Compliance

### Threat Model
| Threat | Likelihood | Impact | Mitigation |
|--------|-----------|--------|------------|
| Malformed config key injection into CLAUDE.md | Low | Low — corrupts speq block only | Validate keys against allowlist before writing |
| Readable sidecar contains sensitive info from PRD | Low | Low — same as existing PRD | No change — same content, different format |

### Data Classification
Config values (`on`/`off`) stored in CLAUDE.md. No sensitive data.

### Authentication & Authorization
N/A — local CLI tool, no auth.

## Failure Modes
| Dependency | Failure scenario | Detection | Degraded behavior | Recovery |
|------------|-----------------|-----------|-------------------|----------|
| CLAUDE.md | File missing when `speq config` runs | `existsSync` check | Print "Run `speq init` first" and exit 1 | User runs `speq init` |
| CLAUDE.md | Speq markers missing or malformed | Marker search returns -1 | Print "Speq block not found in CLAUDE.md. Run `speq init`" and exit 1 | User runs `speq init` |
| Prompt reads config | Config section missing from speq block | Prompt sees no config | Prompts default to caveman on (the default) | User runs `speq init` to regenerate |

## Definition of Done
- [ ] All functional requirements implemented and tested
- [ ] Line coverage >= 80%, branch coverage >= 70%
- [ ] `speq config` reads and writes settings correctly (idempotent)
- [ ] `/requirements` produces both compressed and readable PRDs when caveman.prd is on
- [ ] `/spec` produces compressed OpenSpec when caveman.openspec is on
- [ ] `/plan` produces terse Beads tasks when caveman.beads is on
- [ ] `/requirements` and `/enrich` use lazy scanning (no full upfront scan)
- [ ] All new public functions have JSDoc
- [ ] docs/api.md updated with `speq config` command
- [ ] docs/install.md, docs/faq.md, CONTRIBUTING.md updated if applicable
- [ ] CHANGELOG.md entry added

## Open Questions
- What exactly constitutes "compressed" for Beads task descriptions? Proposed: title stays short (already is), description drops prose and uses bullet fragments instead of sentences.
