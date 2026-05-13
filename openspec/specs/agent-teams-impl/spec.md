# agent-teams-impl Spec

## Purpose
Opt-in multi-agent /implement via agent-teams fan-out, dispatching the Beads task graph to parallel worktrees.

## Refs
- Tables: none
- APIs: `agent-teams /spawn` (external CLI), `bd` (Beads task graph)
- Reuses: config-loading (`steps.implement.impl`), model-routing (implementer model), `src/runner.ts` (spawn)
- New: `src/agent-teams.ts` (integration module)

## Requirements

### Req: Agent-Teams Dispatch
SHALL invoke agent-teams /spawn with the Beads task graph when configured.

#### P1: Fan-out invoked with correct arguments
- GIVEN: `speq.config.yaml` has `steps.implement.impl: agent-teams` and agent-teams is installed
- WHEN: `/implement` runs
- THEN: `agent-teams /spawn` is invoked via `spawn("agent-teams", [...], { shell: false })` with the Beads task graph and configured implementer model

#### P1: Sequential mode unchanged
- GIVEN: `speq.config.yaml` has `steps.implement.impl: sequential` (default)
- WHEN: `/implement` runs
- THEN: current single-agent TDD loop runs, agent-teams is not invoked

#### P2: Agent-teams not installed
- GIVEN: `steps.implement.impl: agent-teams` but `agent-teams` binary not in PATH
- WHEN: `/implement` runs
- THEN: error "agent-teams not found. Install from https://github.com/sransom/agent-teams or set steps.implement.impl: sequential", pipeline halts

### Req: Post-Integration Verify
SHALL run /verify against the merged diff after agent-teams integrate completes.

#### P1: Verify runs after integrate
- GIVEN: agent-teams fan-out completes and all arms pass
- WHEN: integrate merges worktrees
- THEN: `/verify` is automatically invoked against the merged diff

#### P2: Failing arm reopens issue
- GIVEN: one fan-out arm fails for Beads issue X
- WHEN: agent-teams reports the failure
- THEN: issue X is reopened in Beads, retry attempted (up to 3 times), after 3 failures user is prompted

### Req: Security

#### P0: Worktrees honor env-only secrets
- GIVEN: agent-teams creates parallel worktrees
- WHEN: each worktree runs its implementation task
- THEN: no secrets are written to worktree state files, credentials come from env vars only, `spawn` uses `shell: false`

#### P1: Idempotent resume
- GIVEN: a `/ship` run interrupted mid agent-teams fan-out with 3 of 5 arms complete
- WHEN: `/ship --resume` or `speq resume` runs
- THEN: `agent-teams /spawn --resume` is called, completed arms are not re-run, only pending arms execute

### Req: Performance

#### P1: Orchestration overhead under 5s
- GIVEN: agent-teams is installed and Beads graph has 10 tasks
- WHEN: `/implement` dispatches to agent-teams
- THEN: time from `/implement` invocation to agent-teams `/spawn` execution is <5s (excluding agent-teams' own runtime)
