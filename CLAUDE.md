# speq — agent instructions

## Task tracking
Always use `bd` for all task tracking. Never mark a task done unless
its acceptance criteria are explicitly verified against the OpenSpec
scenario that generated it (see /implement, Step B-3).

## Workflow

| Command | When to use |
|---------|-------------|
| /requirements | Starting from scratch — gathers requirements interactively |
| /enrich | Have a PRD already — grounds it in the codebase |
| /spec | After PRD is ready — generates OpenSpec files |
| /plan | After specs exist — creates Beads task graph |
| /implement | Primary build loop — runs until all tasks closed |
| /verify | Before any merge or release |
| /done | After verify passes — closes the cycle |
| /ship | Single command — runs enrich → spec → plan → implement → verify → done |

## Non-negotiable rules
1. Read the codebase before writing or refining any requirements.
2. No task is marked done without its GIVEN/WHEN/THEN verified against the spec.
3. No code is written before a failing test exists for it.
4. The implement command loops until `bd list --status open` is empty — do not stop early.
5. Documentation is written per scenario during implementation, not as a final step.
6. All user inputs must be validated before processing.
7. Secrets come from environment variables only — never hardcoded.
8. Error responses must not expose stack traces or internal paths to callers.


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
