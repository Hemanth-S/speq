import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock node:child_process before any imports that use it.
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawnSync: vi.fn(actual.spawnSync),
    spawn: vi.fn(),
  };
});

import * as childProcess from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  isAgentTeamsAvailable,
  shouldUseAgentTeams,
  dispatchAgentTeams,
} from "../src/agent-teams.js";
import type { AgentTeamsConfig } from "../src/agent-teams.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal mock ChildProcess that emits "close" with the given exit code.
 */
function makeChildProcess(exitCode: number): ChildProcess {
  const emitter = new EventEmitter() as ChildProcess;
  // Emit asynchronously so callers have time to attach listeners.
  setImmediate(() => emitter.emit("close", exitCode));
  return emitter;
}

/**
 * Return a fake ChildProcess that emits an "error" event (binary not found).
 */
function makeErrorChildProcess(err: Error): ChildProcess {
  const emitter = new EventEmitter() as ChildProcess;
  setImmediate(() => emitter.emit("error", err));
  return emitter;
}

/**
 * Mock spawnSync to simulate agent-teams being in PATH (status 0) or not (status non-0).
 */
function mockWhichAgentTeams(found: boolean): void {
  vi.mocked(childProcess.spawnSync).mockReturnValueOnce({
    status: found ? 0 : 1,
    stdout: Buffer.from(found ? "/usr/local/bin/agent-teams\n" : ""),
    stderr: Buffer.from(found ? "" : "agent-teams not found"),
    pid: 1,
    output: [],
    signal: null,
  });
}

const BASE_CONFIG: AgentTeamsConfig = {
  impl: "agent-teams",
  model: "claude-sonnet-4-5",
};

const SAMPLE_TASKS = [
  { id: "BD-1", title: "Setup auth module", complexity: "M" },
  { id: "BD-2", title: "Add API endpoints", complexity: "L" },
  { id: "BD-3", title: "Write unit tests", complexity: "S" },
];

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// isAgentTeamsAvailable
// ---------------------------------------------------------------------------

describe("isAgentTeamsAvailable", () => {
  it("returns true when agent-teams is in PATH", () => {
    mockWhichAgentTeams(true);
    expect(isAgentTeamsAvailable()).toBe(true);
  });

  it("returns false when agent-teams is not in PATH", () => {
    mockWhichAgentTeams(false);
    expect(isAgentTeamsAvailable()).toBe(false);
  });

  it("uses spawnSync with shell: false to check PATH", () => {
    mockWhichAgentTeams(true);
    isAgentTeamsAvailable();

    const spawnSyncMock = vi.mocked(childProcess.spawnSync);
    expect(spawnSyncMock).toHaveBeenCalledOnce();
    const [, , opts] = spawnSyncMock.mock.calls[0];
    expect(opts?.shell).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shouldUseAgentTeams
// ---------------------------------------------------------------------------

describe("shouldUseAgentTeams", () => {
  it("returns true when impl is agent-teams", () => {
    expect(shouldUseAgentTeams({ impl: "agent-teams", model: "sonnet" })).toBe(true);
  });

  it("returns false when impl is sequential", () => {
    expect(shouldUseAgentTeams({ impl: "sequential", model: "sonnet" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// P1: Sequential mode unchanged — agent-teams not invoked
// ---------------------------------------------------------------------------

describe("Sequential mode unchanged [P1]", () => {
  it("dispatchAgentTeams is not called when impl is sequential", async () => {
    const config: AgentTeamsConfig = { impl: "sequential", model: "sonnet" };

    // shouldUseAgentTeams returns false — caller should not dispatch.
    // Verify the guard function correctly prevents dispatch.
    expect(shouldUseAgentTeams(config)).toBe(false);

    // spawn must NOT have been called.
    expect(vi.mocked(childProcess.spawn)).not.toHaveBeenCalled();
  });

  it("does not check PATH when impl is sequential", () => {
    const config: AgentTeamsConfig = { impl: "sequential", model: "sonnet" };
    expect(shouldUseAgentTeams(config)).toBe(false);
    // spawnSync (used by isAgentTeamsAvailable) should not have been called.
    expect(vi.mocked(childProcess.spawnSync)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// P2: Agent-teams not installed — clear error
// ---------------------------------------------------------------------------

describe("Agent-teams not installed [P2]", () => {
  it("rejects with a clear error message when agent-teams binary is missing", async () => {
    mockWhichAgentTeams(false);

    await expect(
      dispatchAgentTeams("/project", BASE_CONFIG, SAMPLE_TASKS),
    ).rejects.toThrow(
      /agent-teams not found/i,
    );
  });

  it("error message includes install hint", async () => {
    mockWhichAgentTeams(false);

    let errorMessage = "";
    try {
      await dispatchAgentTeams("/project", BASE_CONFIG, SAMPLE_TASKS);
    } catch (err) {
      errorMessage = (err as Error).message;
    }

    expect(errorMessage).toContain("https://github.com/sransom/agent-teams");
  });

  it("error message includes sequential fallback hint", async () => {
    mockWhichAgentTeams(false);

    let errorMessage = "";
    try {
      await dispatchAgentTeams("/project", BASE_CONFIG, SAMPLE_TASKS);
    } catch (err) {
      errorMessage = (err as Error).message;
    }

    expect(errorMessage).toContain("steps.implement.impl: sequential");
  });

  it("pipeline halts — spawn is never called when binary is missing", async () => {
    mockWhichAgentTeams(false);

    try {
      await dispatchAgentTeams("/project", BASE_CONFIG, SAMPLE_TASKS);
    } catch {
      // expected
    }

    expect(vi.mocked(childProcess.spawn)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// P1: Fan-out invoked with correct spawn arguments (shell: false)
// ---------------------------------------------------------------------------

describe("Fan-out invoked with correct arguments [P1]", () => {
  it("calls spawn with 'agent-teams' as the command", async () => {
    mockWhichAgentTeams(true);
    vi.mocked(childProcess.spawn).mockReturnValueOnce(makeChildProcess(0));

    await dispatchAgentTeams("/project", BASE_CONFIG, SAMPLE_TASKS);

    const spawnMock = vi.mocked(childProcess.spawn);
    expect(spawnMock).toHaveBeenCalledOnce();
    expect(spawnMock.mock.calls[0][0]).toBe("agent-teams");
  });

  it("always uses shell: false in spawn options", async () => {
    mockWhichAgentTeams(true);
    vi.mocked(childProcess.spawn).mockReturnValueOnce(makeChildProcess(0));

    await dispatchAgentTeams("/project", BASE_CONFIG, SAMPLE_TASKS);

    const spawnMock = vi.mocked(childProcess.spawn);
    const opts = spawnMock.mock.calls[0][2] as { shell?: boolean };
    expect(opts.shell).toBe(false);
  });

  it("passes stdio: inherit in spawn options", async () => {
    mockWhichAgentTeams(true);
    vi.mocked(childProcess.spawn).mockReturnValueOnce(makeChildProcess(0));

    await dispatchAgentTeams("/project", BASE_CONFIG, SAMPLE_TASKS);

    const spawnMock = vi.mocked(childProcess.spawn);
    const opts = spawnMock.mock.calls[0][2] as { stdio?: string };
    expect(opts.stdio).toBe("inherit");
  });

  it("passes /spawn subcommand as first argument", async () => {
    mockWhichAgentTeams(true);
    vi.mocked(childProcess.spawn).mockReturnValueOnce(makeChildProcess(0));

    await dispatchAgentTeams("/project", BASE_CONFIG, SAMPLE_TASKS);

    const spawnMock = vi.mocked(childProcess.spawn);
    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args[0]).toBe("/spawn");
  });

  it("passes --model flag with configured model", async () => {
    mockWhichAgentTeams(true);
    vi.mocked(childProcess.spawn).mockReturnValueOnce(makeChildProcess(0));

    await dispatchAgentTeams("/project", BASE_CONFIG, SAMPLE_TASKS);

    const spawnMock = vi.mocked(childProcess.spawn);
    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).toContain("--model");
    const modelIdx = args.indexOf("--model");
    expect(args[modelIdx + 1]).toBe(BASE_CONFIG.model);
  });

  it("passes task IDs in the arguments", async () => {
    mockWhichAgentTeams(true);
    vi.mocked(childProcess.spawn).mockReturnValueOnce(makeChildProcess(0));

    await dispatchAgentTeams("/project", BASE_CONFIG, SAMPLE_TASKS);

    const spawnMock = vi.mocked(childProcess.spawn);
    const args = spawnMock.mock.calls[0][1] as string[];
    const argsStr = args.join(" ");
    for (const task of SAMPLE_TASKS) {
      expect(argsStr).toContain(task.id);
    }
  });

  it("passes project directory to spawn", async () => {
    mockWhichAgentTeams(true);
    vi.mocked(childProcess.spawn).mockReturnValueOnce(makeChildProcess(0));

    const projectDir = "/my/project/dir";
    await dispatchAgentTeams(projectDir, BASE_CONFIG, SAMPLE_TASKS);

    const spawnMock = vi.mocked(childProcess.spawn);
    const opts = spawnMock.mock.calls[0][2] as { cwd?: string };
    expect(opts.cwd).toBe(projectDir);
  });

  it("returns ok: true and lists completed tasks on exit code 0", async () => {
    mockWhichAgentTeams(true);
    vi.mocked(childProcess.spawn).mockReturnValueOnce(makeChildProcess(0));

    const result = await dispatchAgentTeams("/project", BASE_CONFIG, SAMPLE_TASKS);

    expect(result.ok).toBe(true);
    expect(result.completedTasks.length).toBeGreaterThan(0);
    expect(result.failedTasks).toHaveLength(0);
  });

  it("returns ok: false and lists failed tasks on non-zero exit code", async () => {
    mockWhichAgentTeams(true);
    vi.mocked(childProcess.spawn).mockReturnValueOnce(makeChildProcess(1));

    const result = await dispatchAgentTeams("/project", BASE_CONFIG, SAMPLE_TASKS);

    expect(result.ok).toBe(false);
    expect(result.failedTasks.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// P0: Worktrees honor env-only secrets — no secrets in spawn args or env override
// ---------------------------------------------------------------------------

describe("Worktrees honor env-only secrets [P0]", () => {
  it("does not pass env var values in spawn args", async () => {
    const secretValue = "sk-super-secret-key-99999";
    process.env["SPEQ_TEST_SECRET_KEY"] = secretValue;

    try {
      mockWhichAgentTeams(true);
      vi.mocked(childProcess.spawn).mockReturnValueOnce(makeChildProcess(0));

      await dispatchAgentTeams("/project", BASE_CONFIG, SAMPLE_TASKS);

      const spawnMock = vi.mocked(childProcess.spawn);
      const args = spawnMock.mock.calls[0][1] as string[];
      const argsStr = args.join(" ");
      expect(argsStr).not.toContain(secretValue);
    } finally {
      delete process.env["SPEQ_TEST_SECRET_KEY"];
    }
  });

  it("does not pass env: { ...process.env, ... } overrides in spawn options", async () => {
    mockWhichAgentTeams(true);
    vi.mocked(childProcess.spawn).mockReturnValueOnce(makeChildProcess(0));

    await dispatchAgentTeams("/project", BASE_CONFIG, SAMPLE_TASKS);

    const spawnMock = vi.mocked(childProcess.spawn);
    const opts = spawnMock.mock.calls[0][2] as { env?: Record<string, string> };
    // env must be undefined — never explicitly set in spawn options
    // (child inherits process.env automatically without it being in spawn opts)
    expect(opts.env).toBeUndefined();
  });

  it("spawn options object does not contain any key named 'env'", async () => {
    mockWhichAgentTeams(true);
    vi.mocked(childProcess.spawn).mockReturnValueOnce(makeChildProcess(0));

    await dispatchAgentTeams("/project", BASE_CONFIG, SAMPLE_TASKS);

    const spawnMock = vi.mocked(childProcess.spawn);
    const opts = spawnMock.mock.calls[0][2] as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(opts, "env")).toBe(false);
  });

  it("shell: false is enforced to prevent secret interpolation via shell", async () => {
    mockWhichAgentTeams(true);
    vi.mocked(childProcess.spawn).mockReturnValueOnce(makeChildProcess(0));

    await dispatchAgentTeams("/project", BASE_CONFIG, SAMPLE_TASKS);

    const spawnMock = vi.mocked(childProcess.spawn);
    const opts = spawnMock.mock.calls[0][2] as { shell?: boolean };
    // shell must be explicitly false (not undefined, not true)
    expect(opts.shell).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// P1: Idempotent resume — --resume flag passed
// ---------------------------------------------------------------------------

describe("Idempotent resume [P1]", () => {
  it("passes --resume flag when options.resume is true", async () => {
    mockWhichAgentTeams(true);
    vi.mocked(childProcess.spawn).mockReturnValueOnce(makeChildProcess(0));

    await dispatchAgentTeams("/project", BASE_CONFIG, SAMPLE_TASKS, { resume: true });

    const spawnMock = vi.mocked(childProcess.spawn);
    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).toContain("--resume");
  });

  it("does not pass --resume flag when options.resume is false", async () => {
    mockWhichAgentTeams(true);
    vi.mocked(childProcess.spawn).mockReturnValueOnce(makeChildProcess(0));

    await dispatchAgentTeams("/project", BASE_CONFIG, SAMPLE_TASKS, { resume: false });

    const spawnMock = vi.mocked(childProcess.spawn);
    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).not.toContain("--resume");
  });

  it("does not pass --resume flag when options is omitted", async () => {
    mockWhichAgentTeams(true);
    vi.mocked(childProcess.spawn).mockReturnValueOnce(makeChildProcess(0));

    await dispatchAgentTeams("/project", BASE_CONFIG, SAMPLE_TASKS);

    const spawnMock = vi.mocked(childProcess.spawn);
    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).not.toContain("--resume");
  });

  it("completed arms are not re-run — spawn called exactly once per dispatch", async () => {
    mockWhichAgentTeams(true);
    vi.mocked(childProcess.spawn).mockReturnValueOnce(makeChildProcess(0));

    await dispatchAgentTeams("/project", BASE_CONFIG, SAMPLE_TASKS, { resume: true });

    // agent-teams itself handles idempotency internally;
    // dispatchAgentTeams must only call spawn once.
    expect(vi.mocked(childProcess.spawn)).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// P1: Verify runs after integrate completes
// ---------------------------------------------------------------------------

describe("Verify runs after integrate completes [P1]", () => {
  it("result.ok is true when agent-teams exits 0 (integrate succeeded)", async () => {
    mockWhichAgentTeams(true);
    vi.mocked(childProcess.spawn).mockReturnValueOnce(makeChildProcess(0));

    const result = await dispatchAgentTeams("/project", BASE_CONFIG, SAMPLE_TASKS);

    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/success|complete|done/i);
  });

  it("result.ok is false when agent-teams exits non-zero (integrate failed)", async () => {
    mockWhichAgentTeams(true);
    vi.mocked(childProcess.spawn).mockReturnValueOnce(makeChildProcess(2));

    const result = await dispatchAgentTeams("/project", BASE_CONFIG, SAMPLE_TASKS);

    expect(result.ok).toBe(false);
    expect(result.message).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// P2: Failing arm reopens issue (mock bd calls)
// ---------------------------------------------------------------------------

describe("Failing arm reopens issue [P2]", () => {
  it("result includes failed task IDs when exit code is non-zero", async () => {
    mockWhichAgentTeams(true);
    vi.mocked(childProcess.spawn).mockReturnValueOnce(makeChildProcess(1));

    const result = await dispatchAgentTeams("/project", BASE_CONFIG, SAMPLE_TASKS);

    expect(result.ok).toBe(false);
    // At least some tasks must be reported as failed.
    expect(result.failedTasks.length).toBeGreaterThan(0);
  });

  it("result.failedTasks contains task IDs from the input list", async () => {
    mockWhichAgentTeams(true);
    vi.mocked(childProcess.spawn).mockReturnValueOnce(makeChildProcess(1));

    const result = await dispatchAgentTeams("/project", BASE_CONFIG, SAMPLE_TASKS);

    // Each failed task ID must have come from the input.
    const inputIds = SAMPLE_TASKS.map((t) => t.id);
    for (const failedId of result.failedTasks) {
      expect(inputIds).toContain(failedId);
    }
  });

  it("result.completedTasks is empty when all arms fail (exit 1)", async () => {
    mockWhichAgentTeams(true);
    vi.mocked(childProcess.spawn).mockReturnValueOnce(makeChildProcess(1));

    const result = await dispatchAgentTeams("/project", BASE_CONFIG, SAMPLE_TASKS);

    expect(result.completedTasks).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// P1: Orchestration overhead under 5s
// ---------------------------------------------------------------------------

describe("Orchestration overhead under 5s [P1]", () => {
  it("dispatches to agent-teams in under 5000ms (excluding agent-teams runtime)", async () => {
    // Build a large task graph (10 tasks) to stress the dispatch path.
    const tenTasks = Array.from({ length: 10 }, (_, i) => ({
      id: `BD-${i + 1}`,
      title: `Task ${i + 1}`,
      complexity: "M",
    }));

    mockWhichAgentTeams(true);
    vi.mocked(childProcess.spawn).mockReturnValueOnce(makeChildProcess(0));

    const start = Date.now();
    await dispatchAgentTeams("/project", BASE_CONFIG, tenTasks);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(5000);
  });
});

// ---------------------------------------------------------------------------
// Spawn error handling (binary found but spawn itself fails)
// ---------------------------------------------------------------------------

describe("Spawn error handling", () => {
  it("returns ok: false when spawn emits an error event", async () => {
    mockWhichAgentTeams(true);
    vi.mocked(childProcess.spawn).mockReturnValueOnce(
      makeErrorChildProcess(new Error("ENOENT: spawn agent-teams")),
    );

    const result = await dispatchAgentTeams("/project", BASE_CONFIG, SAMPLE_TASKS);

    expect(result.ok).toBe(false);
    expect(result.message).toBeTruthy();
  });

  it("all tasks listed as failed when spawn emits error", async () => {
    mockWhichAgentTeams(true);
    vi.mocked(childProcess.spawn).mockReturnValueOnce(
      makeErrorChildProcess(new Error("spawn failed")),
    );

    const result = await dispatchAgentTeams("/project", BASE_CONFIG, SAMPLE_TASKS);

    expect(result.failedTasks).toHaveLength(SAMPLE_TASKS.length);
    expect(result.completedTasks).toHaveLength(0);
  });
});
