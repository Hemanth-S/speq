# Changelog

## [Unreleased] - 2026-05-13

### Added

- `speq board` CLI command and `/board` slash command — renders the F6 sprint board (pipeline state, Beads issues, config, cost data) to `.speq/board.html`
- `runBoard(cwd)` exported from `src/cli.ts` — programmatic entry to render the board with a configurable working directory
- `RunOptions.cwd` on `run()` for testability when dispatching project-aware commands

## [0.2.0] - 2026-04-14

### Added

- Caveman mode: configurable compressed output for PRDs, OpenSpec, and Beads tasks (on by default)
- `speq config` command to get/set caveman mode settings
- `speq init` includes default caveman config in CLAUDE.md speq block
- Compressed PRD generates both `prd-<name>.md` (terse) and `prd-<name>.readable.md` (verbose sidecar)
- Lazy codebase scanning in `/requirements` and `/enrich` — lightweight scan first, deeper on demand
- Programmatic API: `readConfig()`, `writeConfig()`, `formatConfig()`, `getValidKeys()`

## [0.1.0] - 2026-04-14

### Added

- Initial release: eight slash commands for spec-driven TDD development
- Node.js/TypeScript CLI (`speq`) wrapping all 8 commands via `claude --prompt-file`
- `speq init` scaffolds a project: copies command files, amends CLAUDE.md with idempotent markers, runs `bd init`
- `speq ship` runs the full pipeline (enrich → spec → plan → implement → verify → done)
- `speq ship --from=<phase>` resumes the pipeline from a specific phase
- `speq resume` detects pipeline state from project artifacts and resumes automatically
- Cross-platform setup scripts (`setup.sh`, `setup.ps1`) for installing dependencies
- Programmatic API: `run()`, `init()`, `runCommand()`, `detectState()`, `isValidPhase()`, `getPhasesFrom()`
