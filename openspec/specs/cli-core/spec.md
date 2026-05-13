# cli-core Specification

## Purpose
Provide the `speq` CLI entry point with argument parsing, version display,
help output, and command routing to the appropriate handler module.

## Codebase references
- Tables/collections: none
- APIs called or extended: none
- Services/modules reused: `package.json` (version field)
- New schema required: `package.json` with `bin.speq` pointing to compiled entry point

## Requirements

### Requirement: CLI Entry Point
The system SHALL provide a global `speq` executable that parses
arguments and routes to the correct command handler.

#### Scenario: Display version [P1]
- GIVEN the CLI is installed globally via npm
- WHEN  the user runs `speq --version`
- THEN  the CLI prints the version string from `package.json` to stdout
- AND   exits with code 0

#### Scenario: Display help [P1]
- GIVEN the CLI is installed globally via npm
- WHEN  the user runs `speq --help`
- THEN  the CLI prints usage information listing all available commands (init, requirements, enrich, spec, plan, implement, verify, done, ship, resume)
- AND   each command has a one-line description
- AND   exits with code 0

#### Scenario: Unknown command [P0]
- GIVEN the CLI is installed globally via npm
- WHEN  the user runs `speq nonexistent`
- THEN  the CLI prints an error message: "Unknown command: nonexistent"
- AND   prints "Run speq --help for usage information"
- AND   exits with code 1
- AND   does not expose any internal file paths or stack traces

#### Scenario: No arguments [P1]
- GIVEN the CLI is installed globally via npm
- WHEN  the user runs `speq` with no arguments
- THEN  the CLI prints the help output (same as `--help`)
- AND   exits with code 0

#### Scenario: CLI startup performance [P1]
- GIVEN the CLI is installed globally via npm
- WHEN  the user runs `speq --version`
- THEN  the command completes in under 200ms wall-clock time

### Requirement: Command Injection Prevention
The system SHALL prevent command injection through user-supplied arguments.

#### Scenario: Malicious argument rejected [P0]
- GIVEN the CLI is installed globally via npm
- WHEN  the user runs `speq init` in a directory whose path contains shell metacharacters (e.g., `; rm -rf /` or `$(whoami)`)
- THEN  the CLI processes the path as a literal string
- AND   does not execute any injected commands
- AND   uses `child_process.spawn` (not `exec`) with `shell: false`
