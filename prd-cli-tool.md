# speq CLI Tool PRD

## Problem Statement

Developers adopting speq must manually copy Markdown files into their project,
install dependencies one by one, and remember to invoke slash commands from
inside a Claude Code session. There is no single entry point, no cross-platform
installer, and no way to resume a failed pipeline run. This friction means a
developer cannot go from `git clone` to a working `speq ship` in under five
minutes — especially on Windows where shell scripts are not native.

## Goals

- A single `speq` CLI binary (via npm global install) that wraps all eight
  slash commands and delegates to `claude --prompt-file`
- A `speq init` command that scaffolds a project for speq usage (copies
  commands, amends CLAUDE.md, initialises Beads)
- A cross-platform setup script (`setup.sh` for Mac/Linux, `setup.ps1` for
  Windows) that installs the CLI and all dependencies
- Pipeline resume capability: detect which phase failed and allow re-entry
  via `speq ship --from=<phase>` or `speq resume`
- A developer can go from `git clone` to `speq ship` in under 5 minutes on
  Windows, Mac, or Linux

## Non-Goals

- Running Claude Code prompts without a `claude` CLI installation — the CLI
  delegates to `claude`, it does not replace it
- A GUI or web dashboard
- Hosting or cloud deployment of speq
- Supporting task trackers other than Beads (`bd`)
- Supporting AI providers other than Claude Code

## Codebase Integration

### Existing tables/collections this feature reads or writes

| Table/Collection | Operation | Key columns used | Notes |
|-----------------|-----------|-----------------|-------|
| N/A | — | — | speq has no database; this is a greenfield CLI |

### Existing APIs this feature calls or extends

| Method | Path | Auth required | Purpose |
|--------|------|--------------|---------|
| N/A | — | — | No existing API surface |

### Existing services/modules to reuse

| Service/Module | What it provides | Path |
|---------------|-----------------|------|
| requirements.md | `/requirements` prompt | `.claude/commands/requirements.md` |
| enrich.md | `/enrich` prompt | `.claude/commands/enrich.md` |
| spec.md | `/spec` prompt | `.claude/commands/spec.md` |
| plan.md | `/plan` prompt | `.claude/commands/plan.md` |
| implement.md | `/implement` prompt | `.claude/commands/implement.md` |
| verify.md | `/verify` prompt | `.claude/commands/verify.md` |
| done.md | `/done` prompt | `.claude/commands/done.md` |
| ship.md | `/ship` prompt | `.claude/commands/ship.md` |
| CLAUDE.md | Agent instructions template (already contains `<!-- BEGIN BEADS INTEGRATION -->` / `<!-- END BEADS INTEGRATION -->` markers from `bd init` — speq markers must coexist) | `CLAUDE.md` |
| settings.json | Claude Code hooks config (SessionStart, PreCompact → `bd prime`) | `.claude/settings.json` |
| .gitignore | Existing ignore patterns for node_modules, dist, .beads/local, .dolt | `.gitignore` |
| docs/install.md | Current manual install steps — reference for setup script logic | `docs/install.md` |

### New tables, columns, or endpoints required

| Type | Name | Purpose | Why not reusing existing |
|------|------|---------|--------------------------|
| npm package | `speq` | Global CLI tool | Nothing exists yet |
| Executable | `speq` | CLI entry point | New capability |
| Script | `setup.sh` | Mac/Linux installer | New capability |
| Script | `setup.ps1` | Windows installer | New capability |
| Config | `package.json` | npm package manifest with `bin` field for global install | New capability |
| Config | `tsconfig.json` | TypeScript compilation config | New capability |

## Customer Experience

A developer discovers speq and wants to use it on their existing Node.js project.

1. They clone speq and run the setup script:
   - Mac/Linux: `curl -fsSL https://raw.githubusercontent.com/Hemanth-S/speq/main/setup.sh | bash`
     (or clone + `./setup.sh`)
   - Windows: `irm https://raw.githubusercontent.com/Hemanth-S/speq/main/setup.ps1 | iex`
     (or clone + `.\setup.ps1`)

2. The setup script checks for Node.js >= 18, installs the `speq` npm package
   globally, installs `@beads/bd` globally, and confirms all dependencies are
   present. It prints a summary of what was installed.

3. The developer navigates to their project and runs:
   ```
   cd ~/my-project
   speq init
   ```
   This copies `.claude/commands/*.md` into the project, amends `CLAUDE.md`
   with speq instructions (using `<!-- BEGIN SPEQ -->` / `<!-- END SPEQ -->`
   markers for idempotent updates), and runs `bd init`.

4. The developer starts building a feature:
   ```
   speq requirements
   ```
   This shells out to `claude --prompt-file .claude/commands/requirements.md`.
   Claude Code starts the interactive requirements session.

5. After the PRD is written, they run:
   ```
   speq ship
   ```
   The CLI invokes `claude --prompt-file .claude/commands/ship.md`. If the
   pipeline fails mid-way (e.g., tests fail during the implement phase),
   the CLI detects which phase failed from Claude's output and exit code,
   then prints:
   ```
   Pipeline failed at phase: implement
   To resume: speq ship --from=implement
   ```

6. The developer fixes the issue and runs:
   ```
   speq ship --from=implement
   ```
   The CLI resumes from the implement phase.

## Functional Requirements

- FR-1: The system SHALL provide a global `speq` CLI command after npm
  global installation.
- FR-2: `speq init` SHALL copy all files from the speq commands directory
  into the target project's `.claude/commands/` directory.
- FR-3: `speq init` SHALL amend `CLAUDE.md` in the target project using
  `<!-- BEGIN SPEQ -->` / `<!-- END SPEQ -->` markers, replacing the
  content between markers on subsequent runs. It SHALL preserve any
  existing `<!-- BEGIN BEADS INTEGRATION -->` / `<!-- END BEADS INTEGRATION -->`
  markers and other content outside the speq markers.
- FR-4: `speq init` SHALL run `bd init` in the target project if `.beads`
  does not already exist.
- FR-5: `speq <command>` (where command is one of: requirements, enrich,
  spec, plan, implement, verify, done, ship) SHALL invoke
  `claude --prompt-file .claude/commands/<command>.md` in the current
  working directory.
- FR-6: `speq ship --from=<phase>` SHALL skip phases before the specified
  phase and begin execution from that phase.
- FR-7: When a pipeline command fails, the CLI SHALL detect the failed
  phase from Claude's exit code and output, and print a resume command.
- FR-8: `speq resume` SHALL re-detect the current pipeline state by
  inspecting artifacts and resume from the appropriate phase. Detection
  logic:
  - No `prd-*.md` → resume from `enrich` (or error if no PRD at all)
  - No `openspec/specs/*/spec.md` → resume from `spec`
  - `bd list --status open` returns tasks → resume from `implement`
  - All tasks closed, verify not run → resume from `verify`
  - All passed → resume from `done`
- FR-9: The setup script (`setup.sh`) SHALL work on macOS and Linux,
  checking for and installing: Node.js >= 18 (or prompting to install),
  `speq` (npm global), and `@beads/bd` (npm global).
- FR-10: The setup script (`setup.ps1`) SHALL work on Windows with
  PowerShell, performing the same dependency checks and installs as FR-9.
- FR-11: `speq init` SHALL be idempotent — running it twice on the same
  project SHALL not duplicate content or break existing configuration.
- FR-12: `speq --version` SHALL print the current version.
- FR-13: `speq --help` SHALL print usage information for all commands.
- FR-14: `speq` SHALL pass through all `claude` stdout and stderr to the
  user's terminal in real time.

## Non-Functional Requirements

- NFR-PERF: CLI startup time < 200ms (cold start, no network calls).
  `speq init` completes in < 30s including `bd init`.
<!-- VALIDATED: CLI cold start measured at ~25ms (2026-04-14) -->
- NFR-AVAIL: N/A — local CLI tool, no uptime requirement. Must work
  offline except for initial setup (npm install).
- NFR-SCALE: Supports projects of any size. File copy and CLAUDE.md
  amendment handle files up to 1MB without issue.
- NFR-SEC: No secrets stored or transmitted by the CLI itself. Setup
  script downloads packages only from npm registry over HTTPS. No
  telemetry, no analytics, no network calls at runtime.

## Security & Compliance

### Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|-----------|--------|------------|
| Command injection via project path | Medium | High | Validate and quote all paths passed to `child_process.spawn`; never use `shell: true` with user input |
| Malicious CLAUDE.md content overwrites speq markers | Low | Medium | Parse markers strictly; only replace content between exact markers |
| Supply chain attack via npm dependencies | Low | High | Minimise dependencies; pin versions; run `npm audit` in CI |
| setup.sh piped from URL executes tampered script | Medium | Critical | Provide checksum verification instructions; recommend clone-then-run |
| Arbitrary code execution via crafted prompt files | Low | High | CLI only reads `.md` files from `.claude/commands/`; does not execute them directly |

### Data Classification

- **Stored by CLI**: No user data. Only copies static Markdown files and
  reads project structure to detect state.
- **Sensitivity**: Public (all prompt files are open source).
- **Retention**: N/A.

### Authentication & Authorization

- No authentication required — local CLI tool.
- Claude Code authentication is handled by the `claude` CLI, not by speq.

## Operational Requirements

### Metrics to emit

- N/A — local CLI tool. No telemetry.

### Alarm conditions

- N/A.

### Runbook sketch

**Failure mode 1: `claude` CLI not found**
1. `speq ship` runs, attempts `claude --prompt-file ...`
2. `claude` is not in PATH
3. CLI prints: "Claude Code CLI not found. Install it from https://claude.ai/code and ensure `claude` is in your PATH."
4. Exits with code 1.

**Failure mode 2: `bd` not found during `speq init`**
1. `speq init` attempts `bd init`
2. `bd` is not in PATH
3. CLI prints: "Beads (bd) not found. Run the speq setup script or install manually: npm install -g @beads/bd"
4. Exits with code 1.

## Failure Modes

| Dependency | Failure scenario | Detection | Degraded behavior | Recovery |
|------------|-----------------|-----------|-------------------|----------|
| `claude` CLI | Not installed or not in PATH | `which claude` / `where claude` fails | Print install instructions, exit 1 | User installs Claude Code |
| `bd` CLI | Not installed or not in PATH | `which bd` / `where bd` fails | Print install instructions, exit 1 | User runs setup script or installs manually |
| Node.js | Version < 18 | `node --version` check | Print version requirement, exit 1 | User upgrades Node.js |
| npm registry | Unavailable during setup | npm install fails | Setup script reports failure, suggests retry | User retries when network is available |
| `.claude/commands/` | Missing prompt files after init | Glob for `*.md` returns empty | Print "Run speq init first", exit 1 | User runs `speq init` |
| `claude` session | Crashes or times out mid-pipeline | Non-zero exit code from `claude` | Detect failed phase, print resume command | User runs `speq ship --from=<phase>` |

## Definition of Done

- [ ] All functional requirements (FR-1 through FR-14) implemented and tested
- [ ] P99 latency verified under load per NFR-PERF
- [ ] Security scan: 0 high/critical findings
- [ ] Line coverage >= 80%, branch coverage >= 70%
- [ ] All new public functions/endpoints documented inline
- [ ] API reference updated in docs/
- [ ] Runbook reviewed by one other person
- [ ] Rollback plan documented or feature flagged
- [ ] `setup.sh` tested on macOS and Ubuntu
- [ ] `setup.ps1` tested on Windows 10+ with PowerShell 5.1+
- [ ] `speq init` tested on empty project and existing project with CLAUDE.md
- [ ] `speq ship --from=<phase>` tested for each phase
- [ ] `speq resume` correctly infers state from project artifacts
- [ ] Cross-platform path handling verified (forward vs backslashes)

## Open Questions

- Should `speq init` offer an interactive mode selector for `bd init`
  (default / --stealth / --contributor), or always use default?
- Should the CLI support a `speq update` command to pull latest prompt
  files from the speq repo without re-running full init?
- What is the minimum supported PowerShell version for `setup.ps1` —
  5.1 (ships with Windows 10) or 7+ (cross-platform PowerShell Core)?
