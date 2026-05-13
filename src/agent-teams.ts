import { spawn, spawnSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AgentTeamsConfig {
  impl: "agent-teams" | "sequential";
  model: string;
}

export interface AgentTeamsResult {
  ok: boolean;
  message: string;
  completedTasks: string[];
  failedTasks: string[];
}

// ---------------------------------------------------------------------------
// isAgentTeamsAvailable
// ---------------------------------------------------------------------------

/**
 * Check whether the `agent-teams` binary is available in PATH.
 * Uses spawnSync with shell: false to avoid shell injection.
 * @returns true if the binary is found and exits with status 0.
 */
export function isAgentTeamsAvailable(): boolean {
  const result = spawnSync("which", ["agent-teams"], {
    shell: false,
    encoding: "utf-8",
  });
  return result.status === 0;
}

// ---------------------------------------------------------------------------
// shouldUseAgentTeams
// ---------------------------------------------------------------------------

/**
 * Determine whether agent-teams fan-out should be used based on config.
 * Returns false for the default "sequential" mode so the single-agent TDD
 * loop is left completely unchanged.
 * @param config - The resolved agent-teams configuration.
 */
export function shouldUseAgentTeams(config: AgentTeamsConfig): boolean {
  return config.impl === "agent-teams";
}

// ---------------------------------------------------------------------------
// dispatchAgentTeams
// ---------------------------------------------------------------------------

/**
 * Dispatch the Beads task graph to agent-teams /spawn.
 *
 * Security guarantees:
 * - `spawn` is always called with `shell: false` to prevent shell injection.
 * - No env var values are written into spawn args or the options object.
 *   The child process inherits `process.env` automatically without an
 *   explicit `env:` key in the options — so secrets stay in the environment
 *   and never appear in the argument list or in serialised spawn options.
 *
 * @param projectDir - Absolute path to the project root (used as cwd).
 * @param config - Agent-teams configuration (impl + model).
 * @param tasks - Beads task graph to dispatch.
 * @param options - Optional flags (e.g. resume).
 * @returns A promise resolving to an AgentTeamsResult.
 */
export function dispatchAgentTeams(
  projectDir: string,
  config: AgentTeamsConfig,
  tasks: { id: string; title: string; complexity: string }[],
  options?: { resume?: boolean },
): Promise<AgentTeamsResult> {
  // Guard: binary must be present before we attempt to spawn anything.
  if (!isAgentTeamsAvailable()) {
    return Promise.reject(
      new Error(
        "agent-teams not found. Install from https://github.com/sransom/agent-teams" +
          " or set steps.implement.impl: sequential",
      ),
    );
  }

  const taskIds = tasks.map((t) => t.id);

  // Build argument list.
  // /spawn <task-ids...> --model <model> [--resume]
  // No env var values are ever interpolated here.
  const args: string[] = [
    "/spawn",
    ...taskIds,
    "--model",
    config.model,
  ];

  if (options?.resume === true) {
    args.push("--resume");
  }

  return new Promise<AgentTeamsResult>((resolve) => {
    // spawn options:
    // - shell: false  (always; prevents command injection and secret expansion)
    // - stdio: "inherit"  (pass through so agent-teams output is visible)
    // - cwd: projectDir  (run in project root)
    // - NO env key  (child inherits process.env implicitly; never override)
    const child = spawn("agent-teams", args, {
      shell: false,
      stdio: "inherit",
      cwd: projectDir,
    });

    child.on("close", (code: number | null) => {
      const exitCode = code ?? 1;
      if (exitCode === 0) {
        resolve({
          ok: true,
          message: "agent-teams dispatch completed successfully",
          completedTasks: taskIds,
          failedTasks: [],
        });
      } else {
        resolve({
          ok: false,
          message: `agent-teams exited with code ${exitCode}`,
          completedTasks: [],
          failedTasks: taskIds,
        });
      }
    });

    child.on("error", (err: Error) => {
      resolve({
        ok: false,
        message: `agent-teams spawn error: ${err.message}`,
        completedTasks: [],
        failedTasks: taskIds,
      });
    });
  });
}
