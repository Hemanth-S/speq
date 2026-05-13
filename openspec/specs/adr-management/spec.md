# adr-management Spec

## Purpose
CRUD operations for Architecture Decision Records: add, list, supersede, with frontmatter validation and file management.

## Refs
- Tables: none (file-based)
- APIs: none (CLI subcommand + slash command shims)
- Reuses: `src/cli.ts` (command registration), config-loading (`adr.path` override)
- New: `docs/adr/NNNN-slug.md` files, `src/adr.ts` (TS handler), `.claude/commands/project-adr.md` (shim)

## Requirements

### Req: ADR Creation
SHALL create a new ADR file with correct numbering, frontmatter, and body structure.

#### P1: New ADR created with sequential numbering
- GIVEN: `docs/adr/` contains `0001-use-typescript.md` and `0002-use-vitest.md`
- WHEN: `speq adr add --title "Use YAML for config"` runs
- THEN: `docs/adr/0003-use-yaml-for-config.md` is created with frontmatter `id: 3`, `status: draft`, `tags: []`, and body sections Context, Decision, Consequences

#### P1: First ADR in empty directory
- GIVEN: `docs/adr/` does not exist
- WHEN: `speq adr add --title "Use TypeScript"` runs
- THEN: `docs/adr/` is created, `docs/adr/0001-use-typescript.md` written with `id: 1`, `status: draft`

#### P1: Idempotent add rejected
- GIVEN: `docs/adr/0001-use-typescript.md` already exists
- WHEN: `speq adr add --title "Use TypeScript"` runs again
- THEN: a new ADR `0002-use-typescript.md` is created (not overwritten), both files exist

#### P0: Title with shell metacharacters sanitized
- GIVEN: user provides title `"Use Redis; rm -rf /"`
- WHEN: `speq adr add --title "Use Redis; rm -rf /"` runs
- THEN: slug is sanitized to `use-redis-rm-rf` (special chars stripped), file created safely, no shell execution

### Req: ADR Listing
SHALL list all ADRs with their id, status, and title.

#### P1: List shows all ADRs
- GIVEN: `docs/adr/` contains 3 ADR files with statuses draft, active, superseded
- WHEN: `speq adr list` runs
- THEN: output shows all 3 ADRs with id, status, and title, sorted by id ascending

#### P2: Empty directory listed gracefully
- GIVEN: `docs/adr/` is empty or does not exist
- WHEN: `speq adr list` runs
- THEN: outputs "No ADRs found. Run `speq adr add` to create one.", exits with code 0

### Req: ADR Supersession
SHALL retire an active ADR and create its successor atomically.

#### P1: Supersede creates successor and retires original
- GIVEN: `docs/adr/0002-use-vitest.md` has `status: active`
- WHEN: `speq adr supersede 2 --title "Switch to node:test"` runs
- THEN: ADR 0002 updated to `status: superseded`, new ADR 0003 created with `status: draft`, `supersedes: 2`, both writes succeed or neither does

#### P1: Cannot supersede non-active ADR
- GIVEN: `docs/adr/0001-use-typescript.md` has `status: draft`
- WHEN: `speq adr supersede 1 --title "Switch to Go"` runs
- THEN: error message "ADR 0001 is draft, not active — only active ADRs can be superseded", no files changed

#### P2: Custom ADR path respected
- GIVEN: `speq.config.yaml` has `adr.path: architecture/decisions`
- WHEN: `speq adr add --title "Custom path test"` runs
- THEN: file created in `architecture/decisions/0001-custom-path-test.md`, not in `docs/adr/`
