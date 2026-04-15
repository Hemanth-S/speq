# Changelog

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
