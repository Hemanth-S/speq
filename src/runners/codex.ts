import { spawn as nodeSpawn } from "node:child_process";
import type { SpawnOptionsWithoutStdio } from "node:child_process";
import type { Runner, RunnerOpts, RunnerResult } from "./types.js";

// Spawn function type that matches child_process.spawn signature used here
type SpawnFn = (
  command: string,
  args: string[],
  options: SpawnOptionsWithoutStdio,
) => ReturnType<typeof nodeSpawn>;

/**
 * Runner for OpenAI models via the `codex` CLI.
 * Spawns: codex exec --model <model> <prompt>
 * Always uses shell: false.
 *
 * The `spawnFn` parameter is used for dependency injection in tests.
 */
export class CodexRunner implements Runner {
  readonly name = "codex";
  private readonly _spawn: SpawnFn;

  constructor(spawnFn?: SpawnFn) {
    this._spawn = spawnFn ?? nodeSpawn;
  }

  supports(model: string): boolean {
    return model.startsWith("gpt-") || model.startsWith("o1-") || model.startsWith("o3-");
  }

  exec(prompt: string, model: string, opts: RunnerOpts): Promise<RunnerResult> {
    const args: string[] = ["exec", "--model", model];

    if (opts.promptFile) {
      args.push("--prompt-file", opts.promptFile);
    } else {
      args.push(prompt);
    }

    if (opts.extraArgs && opts.extraArgs.length > 0) {
      args.push(...opts.extraArgs);
    }

    return new Promise((resolve, reject) => {
      let child: ReturnType<typeof nodeSpawn>;

      try {
        child = this._spawn("codex", args, {
          shell: false,
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        reject(
          new Error(`codex CLI not found. Install it or change steps.implement.model to a Claude model. (${msg})`),
        );
        return;
      }

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ENOENT") {
          reject(
            new Error(
              "codex CLI not found. Install it or change steps.implement.model to a Claude model.",
            ),
          );
        } else {
          reject(new Error(`CodexRunner spawn error: ${err.message}`));
        }
      });

      child.on("close", (code: number | null) => {
        resolve({ exitCode: code ?? 1, stdout, stderr });
      });
    });
  }
}
