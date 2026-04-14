# speq — agent instructions

## Task tracking
Always use `bd` for all task tracking. Never mark a task done unless
its acceptance criteria are explicitly verified against the OpenSpec
scenario that generated it (see /project:implement, Step B-3).

## Workflow

| Command | When to use |
|---------|-------------|
| /project:requirements | Starting from scratch — gathers requirements interactively |
| /project:enrich | Have a PRD already — grounds it in the codebase |
| /project:spec | After PRD.md is ready — generates OpenSpec files |
| /project:plan | After specs exist — creates Beads task graph |
| /project:implement | Primary build loop — runs until all tasks closed |
| /project:verify | Before any merge or release |
| /project:done | After verify passes — closes the cycle |
| /project:ship | Single command — runs enrich → spec → plan → implement → verify → done |

## Non-negotiable rules
1. Read the codebase before writing or refining any requirements.
2. No task is marked done without its GIVEN/WHEN/THEN verified against the spec.
3. No code is written before a failing test exists for it.
4. The implement command loops until `bd list --status open` is empty — do not stop early.
5. Documentation is written per scenario during implementation, not as a final step.
6. All user inputs must be validated before processing.
7. Secrets come from environment variables only — never hardcoded.
8. Error responses must not expose stack traces or internal paths to callers.
