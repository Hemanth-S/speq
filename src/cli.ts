/** Result of executing a CLI command. */
export interface RunResult {
  /** Process exit code: 0 for success, 1 for errors. */
  exitCode: number;
  /** Content written to stdout. */
  stdout: string;
  /** Content written to stderr (error messages, warnings). */
  stderr: string;
}

const COMMANDS = [
  "init",
  "config",
  "requirements",
  "enrich",
  "spec",
  "plan",
  "implement",
  "verify",
  "done",
  "ship",
  "resume",
] as const;

type Command = (typeof COMMANDS)[number];

function isValidCommand(cmd: string): cmd is Command {
  return (COMMANDS as readonly string[]).includes(cmd);
}

/**
 * Parse CLI arguments and execute the corresponding command.
 * @param args - Command-line arguments (without the node/binary prefix).
 * @returns A {@link RunResult} with exitCode, stdout, and stderr.
 */
export function run(args: string[]): RunResult {
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    return { exitCode: 0, stdout: getHelp(), stderr: "" };
  }

  if (command === "--version" || command === "-V") {
    return { exitCode: 0, stdout: getVersion(), stderr: "" };
  }

  if (!isValidCommand(command)) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Unknown command: ${command}\nRun speq --help for usage information`,
    };
  }

  return { exitCode: 0, stdout: "", stderr: "" };
}

function getVersion(): string {
  return "0.1.0";
}

function getHelp(): string {
  return `speq - Spec-driven TDD workflow for Claude Code

Usage: speq <command> [options]

Commands:
  init           Initialise speq in the current project
  config         Get or set caveman mode settings
  requirements   Gather requirements via Working Backwards conversation
  enrich         Ground an existing PRD in the codebase
  spec           Convert a PRD into OpenSpec files
  plan           Create a Beads task graph from specs
  implement      Run the TDD implementation loop
  verify         Pre-ship gate check
  done           Close the feature cycle
  ship           Full pipeline: enrich → spec → plan → implement → verify → done
  resume         Detect pipeline state and resume from the appropriate phase

Options:
  --version, -V  Show version
  --help, -h     Show this help`;
}
