import { spawn } from "node:child_process";
import { resolve } from "node:path";

export interface SpawnOptions {
  command: string;
  args: string[];
}

/** Capture the last spawn call for testing. */
export let lastSpawnCall: SpawnOptions | null = null;

/**
 * Execute a command with arguments safely using child_process.spawn.
 * Always uses shell: false to prevent command injection.
 * @param command - The executable to run.
 * @param args - Arguments passed as an array (never interpolated into a shell string).
 * @returns A promise resolving to the process exit code.
 */
export function runCommand(
  command: string,
  args: string[],
): Promise<number> {
  lastSpawnCall = { command, args };

  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
    });

    child.on("close", (code: number | null) => {
      resolvePromise(code ?? 1);
    });

    child.on("error", () => {
      resolvePromise(1);
    });
  });
}

/**
 * Build the prompt file path for a given command name.
 * @param commandName - One of the supported speq commands.
 * @returns Absolute path to the prompt file.
 */
export function getPromptFilePath(commandName: string): string {
  return resolve(process.cwd(), ".claude", "commands", `${commandName}.md`);
}
