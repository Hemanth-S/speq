# config-loading Spec

## Purpose
Load, validate, and merge speq pipeline configuration from four precedence levels (CLI flags > env vars > speq.config.yaml > shipped defaults).

## Refs
- Tables: none (file-based)
- APIs: none (library module)
- Reuses: `src/config.ts` (extend beyond caveman-only), `src/cli.ts` (CLI flag parsing)
- New: `speq.config.yaml` (repo root), `src/schema.ts` (validation schema)

## Requirements

### Req: YAML Config Parsing
SHALL parse `speq.config.yaml` from the project root and produce a typed configuration object.

#### P1: Valid YAML loads correctly
- GIVEN: a `speq.config.yaml` with `steps.implement.model: sonnet` and `steps.spec.prompt_version: v2`
- WHEN: `loadConfig(projectDir)` is called
- THEN: returned config has `steps.implement.model === "sonnet"`, `steps.spec.prompt_version === "v2"`, all other fields populated from shipped defaults

#### P1: Missing config file uses defaults
- GIVEN: no `speq.config.yaml` exists in the project root
- WHEN: `loadConfig(projectDir)` is called
- THEN: returned config equals shipped defaults exactly, no error thrown

#### P1: Idempotent config load
- GIVEN: a valid `speq.config.yaml`
- WHEN: `loadConfig(projectDir)` is called twice with no file changes between calls
- THEN: both calls return deeply equal config objects

### Req: Schema Validation
SHALL reject invalid or dangerous configuration before any pipeline step executes.

#### P0: Secret field names rejected
- GIVEN: a `speq.config.yaml` containing a field `steps.implement.api_secret: sk-abc123`
- WHEN: `loadConfig(projectDir)` is called
- THEN: throws a validation error matching "secret" or "token" in the message, no config object returned, no step executed

#### P1: Malformed YAML produces friendly error
- GIVEN: a `speq.config.yaml` with invalid YAML syntax (e.g., unclosed bracket)
- WHEN: `loadConfig(projectDir)` is called
- THEN: throws an error with a human-readable message including the line number, does not expose internal stack trace

#### P2: Unknown fields rejected with suggestion
- GIVEN: a `speq.config.yaml` with `stepz.implement.model: sonnet` (typo in key)
- WHEN: `loadConfig(projectDir)` is called
- THEN: throws a validation error naming the unknown field and suggesting `steps`

### Req: Four-Level Precedence
SHALL merge configuration from CLI flags, env vars, YAML file, and shipped defaults in strict precedence order.

#### P1: CLI flag overrides YAML
- GIVEN: `speq.config.yaml` has `steps.implement.model: sonnet`
- WHEN: `loadConfig(projectDir, { overrides: { "steps.implement.model": "opus" } })` is called
- THEN: returned config has `steps.implement.model === "opus"`

#### P1: Env var overrides YAML but not CLI
- GIVEN: `speq.config.yaml` has `steps.implement.model: sonnet`, env var `SPEQ_STEPS_IMPLEMENT_MODEL=haiku`, and CLI override `steps.implement.model: opus`
- WHEN: `loadConfig(projectDir, { overrides: { "steps.implement.model": "opus" } })` is called with `SPEQ_STEPS_IMPLEMENT_MODEL=haiku` in process.env
- THEN: returned config has `steps.implement.model === "opus"` (CLI wins)

#### P1: Env var overrides YAML without CLI
- GIVEN: `speq.config.yaml` has `steps.implement.model: sonnet`, env var `SPEQ_STEPS_IMPLEMENT_MODEL=haiku`, no CLI override for that key
- WHEN: `loadConfig(projectDir)` is called
- THEN: returned config has `steps.implement.model === "haiku"` (env wins over file)

### Req: Performance
SHALL complete config loading within the performance budget.

#### P1: Config load under 100ms
- GIVEN: a valid `speq.config.yaml` with 20 configured fields
- WHEN: `loadConfig(projectDir)` is called and wall-clock time measured
- THEN: completes in <100ms
