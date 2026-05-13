# command-runner Specification

## Purpose
Execute speq slash commands by delegating to the Claude Code CLI
with the appropriate prompt file, passing through all output in real time.

## Codebase references
- Tables/collections: none
- APIs called or extended: `claude --prompt-file <path>` (Claude Code CLI)
- Services/modules reused: `.claude/commands/*.md` — prompt files for each command
- New schema required: none

## Requirements

### Requirement: Delegate to Claude CLI
The system SHALL invoke `claude --prompt-file .claude/commands/<command>.md`
for each supported command.

#### Scenario: Run a command successfully [P1]
- GIVEN the CLI is installed and `claude` is in PATH
- AND   `.claude/commands/verify.md` exists in the current directory
- WHEN  the user runs `speq verify`
- THEN  the CLI spawns `claude --prompt-file .claude/commands/verify.md`
- AND   all stdout from the `claude` process is streamed to the user's terminal in real time
- AND   all stderr from the `claude` process is streamed to the user's terminal in real time
- AND   the CLI exits with the same exit code as the `claude` process

#### Scenario: All eight commands are supported [P1]
- GIVEN the CLI is installed
- WHEN  the user runs `speq <cmd>` where `<cmd>` is one of: requirements, enrich, spec, plan, implement, verify, done, ship
- THEN  the CLI invokes `claude --prompt-file .claude/commands/<cmd>.md`

#### Scenario: Claude CLI not found [P0]
- GIVEN `claude` is not available in PATH
- WHEN  the user runs `speq ship`
- THEN  the CLI prints "Claude Code CLI not found. Install it from https://claude.ai/code and ensure `claude` is in your PATH."
- AND   exits with code 1
- AND   does not expose internal file paths or stack traces

#### Scenario: Prompt file missing [P2]
- GIVEN `claude` is in PATH
- AND   `.claude/commands/ship.md` does not exist in the current directory
- WHEN  the user runs `speq ship`
- THEN  the CLI prints "Prompt file not found: .claude/commands/ship.md. Run `speq init` first."
- AND   exits with code 1

#### Scenario: Command with path containing spaces [P1]
- GIVEN the user's project is in a directory with spaces in the path (e.g., `/Users/dev/my project/`)
- AND   `claude` is in PATH and `.claude/commands/ship.md` exists
- WHEN  the user runs `speq ship`
- THEN  the CLI correctly passes the prompt file path to `claude` without breaking on spaces
- AND   `claude` receives and processes the prompt file

### Requirement: Process Isolation
The system SHALL spawn the Claude process safely without shell injection risk.

#### Scenario: Path with shell metacharacters [P0]
- GIVEN the current working directory path contains shell metacharacters (e.g., `$HOME/proj;echo pwned`)
- WHEN  the user runs `speq ship`
- THEN  the CLI uses `child_process.spawn` with `shell: false`
- AND   the path is passed as a literal argument, not interpreted by a shell
- AND   no injected command is executed

#### Scenario: Concurrent execution [P2]
- GIVEN one `speq ship` process is already running in the same project
- WHEN  the user runs `speq ship` in a second terminal
- THEN  both processes execute independently (no lock file required)
- AND   no data corruption occurs
