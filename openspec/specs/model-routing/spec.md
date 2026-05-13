# model-routing Spec

## Purpose
Resolve model shorthands to snapshot IDs, dispatch steps to the correct Runner implementation, and route /implement tasks by complexity.

## Refs
- Tables: none
- APIs: none (library module)
- Reuses: config-loading (per-step model config), `src/runner.ts` (refactored into Runner interface)
- New: `models.yaml` (model card with snapshots, runners, pricing, capabilities), `src/runners/claude.ts` (ClaudeRunner), `src/runners/codex.ts` (CodexRunner), `src/runners/index.ts` (Runner interface + registry)

## Requirements

### Req: Shorthand Resolution
SHALL resolve family shorthands to exact snapshot IDs via models.yaml.

#### P1: Shorthand resolves to snapshot
- GIVEN: `models.yaml` has `haiku: { snapshot: claude-haiku-4-5-20251001, runner: claude }` and config has `steps.spec.model: haiku`
- WHEN: model resolution runs for the spec step
- THEN: resolved model is `claude-haiku-4-5-20251001`, runner is `claude`

#### P1: Exact ID used as-is
- GIVEN: config has `steps.spec.model: claude-haiku-4-5-20251001`
- WHEN: model resolution runs
- THEN: model is `claude-haiku-4-5-20251001`, runner looked up from models.yaml by matching snapshot

#### P1: Unknown model produces clear error
- GIVEN: config has `steps.spec.model: llama-3`  and `llama-3` is not in models.yaml
- WHEN: model resolution runs
- THEN: error "Unknown model: llama-3. Available: haiku, sonnet, opus, gpt-4o-mini" (lists known models)

### Req: Runner Dispatch
SHALL route step execution to the Runner whose supports() matches the resolved model.

#### P1: Claude model dispatched to ClaudeRunner
- GIVEN: resolved model is `claude-sonnet-4-7` with `runner: claude`
- WHEN: `runPhase("implement", resolvedModel)` executes
- THEN: `ClaudeRunner.exec()` is called with `spawn("claude", ["--prompt-file", path])` and `shell: false`

#### P1: GPT model dispatched to CodexRunner
- GIVEN: resolved model is `gpt-4o-mini` with `runner: codex`
- WHEN: `runPhase("implement", resolvedModel)` executes
- THEN: `CodexRunner.exec()` is called with `spawn("codex", ["exec", ...])` and `shell: false`

#### P0: Runner always uses shell: false
- GIVEN: any runner implementation (ClaudeRunner or CodexRunner)
- WHEN: `exec()` spawns a child process
- THEN: spawn is called with `{ shell: false }` — never shell: true

#### P2: Runner binary not found
- GIVEN: config routes to CodexRunner but `codex` is not in PATH
- WHEN: `runPhase` attempts dispatch
- THEN: error "codex CLI not found. Install it or change steps.implement.model to a Claude model.", pipeline does not proceed

#### P1: Runner override via config
- GIVEN: `speq.config.yaml` has `steps.implement.runner: codex` explicitly (overriding models.yaml lookup)
- WHEN: model resolution runs for implement
- THEN: CodexRunner is used regardless of model's default runner tag

### Req: Complexity Routing
SHALL route /implement tasks to different models based on /plan complexity labels.

#### P1: Trivial task routed to cheap model
- GIVEN: Beads issue has `complexity: trivial` and `models.yaml` has `complexity_routing.trivial: haiku`
- WHEN: `/implement` processes this task
- THEN: task is dispatched to haiku (resolved to its snapshot) via ClaudeRunner

#### P1: Complex task routed to primary model
- GIVEN: Beads issue has `complexity: complex` and `speq.config.yaml` overrides `steps.implement.complexity_routing.complex: opus`
- WHEN: `/implement` processes this task
- THEN: task is dispatched to opus (merged override wins over models.yaml default)

#### P1: Missing complexity label uses step default
- GIVEN: Beads issue has no `complexity` label and step default model is `sonnet`
- WHEN: `/implement` processes this task
- THEN: task is dispatched to sonnet

### Req: Performance

#### P1: Model selection under 10ms
- GIVEN: a valid config and models.yaml
- WHEN: model resolution + runner selection runs
- THEN: completes in <10ms

#### P1: Idempotent model resolution
- GIVEN: same config and same models.yaml
- WHEN: model resolution runs twice
- THEN: same snapshot ID, same runner selected both times
