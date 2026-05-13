/**
 * Tests for model-routing capability.
 *
 * Covers: shorthand resolution, exact-ID resolution, unknown model error,
 * runner dispatch, shell:false enforcement, binary-not-found error,
 * runner override via config, complexity routing, performance, idempotency.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

import {
  resolveModel,
  resolveComplexityModel,
  getRunner,
  clearModelsCache,
} from "../src/runners/index.js";
import { ClaudeRunner } from "../src/runners/claude.js";
import { CodexRunner } from "../src/runners/codex.js";
// Verify PipelineConfig type is importable as required by the task spec
import type { PipelineConfig } from "../src/pipeline-config.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "speq-model-test-"));
}

const MODELS_YAML_CONTENT = `
models:
  haiku:
    snapshot: claude-haiku-4-5-20251001
    runner: claude
    capabilities: []
  sonnet:
    snapshot: claude-sonnet-4-7
    runner: claude
    capabilities: []
  opus:
    snapshot: claude-opus-4-6
    runner: claude
    capabilities: [verify-native]
  gpt-4o-mini:
    runner: codex
    capabilities: []
complexity_routing:
  trivial: haiku
  simple: haiku
  standard: sonnet
  complex: sonnet
`.trim();

/**
 * Create a fake ChildProcess-like EventEmitter.
 * The spawnFn injected into runners returns this object.
 * When errorCode is set, it emits "error"; otherwise emits "close".
 */
function makeFakeProcess(opts: {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  errorCode?: string;
}): ChildProcess {
  const proc = new EventEmitter();

  const stdoutEmitter = new EventEmitter();
  const stderrEmitter = new EventEmitter();

  (proc as Record<string, unknown>).stdout = stdoutEmitter;
  (proc as Record<string, unknown>).stderr = stderrEmitter;

  // Use setImmediate so .on() handlers are wired before events fire
  setImmediate(() => {
    if (opts.errorCode) {
      const err = Object.assign(new Error("spawn ENOENT"), {
        code: opts.errorCode,
      });
      proc.emit("error", err);
    } else {
      if (opts.stdout) stdoutEmitter.emit("data", Buffer.from(opts.stdout));
      if (opts.stderr) stderrEmitter.emit("data", Buffer.from(opts.stderr));
      proc.emit("close", opts.exitCode ?? 0);
    }
  });

  return proc as unknown as ChildProcess;
}

/**
 * Type-compatible spawn function for injection into ClaudeRunner / CodexRunner.
 */
type SpawnFn = (
  command: string,
  args: string[],
  options: Record<string, unknown>,
) => ChildProcess;

// ---------------------------------------------------------------------------
// STEP 1 — Shorthand Resolution
// ---------------------------------------------------------------------------

describe("Shorthand Resolution", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    writeFileSync(join(tmpDir, "models.yaml"), MODELS_YAML_CONTENT);
    clearModelsCache();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    clearModelsCache();
  });

  it("P1: shorthand resolves to snapshot — haiku -> claude-haiku-4-5-20251001", () => {
    const result = resolveModel("haiku", tmpDir);
    expect(result.snapshot).toBe("claude-haiku-4-5-20251001");
    expect(result.runner).toBe("claude");
  });

  it("P1: shorthand resolves to snapshot — sonnet", () => {
    const result = resolveModel("sonnet", tmpDir);
    expect(result.snapshot).toBe("claude-sonnet-4-7");
    expect(result.runner).toBe("claude");
  });

  it("P1: shorthand resolves to snapshot — opus with capabilities", () => {
    const result = resolveModel("opus", tmpDir);
    expect(result.snapshot).toBe("claude-opus-4-6");
    expect(result.runner).toBe("claude");
    expect(result.capabilities).toContain("verify-native");
  });

  it("P1: exact snapshot ID used as-is — claude-haiku-4-5-20251001", () => {
    const result = resolveModel("claude-haiku-4-5-20251001", tmpDir);
    expect(result.snapshot).toBe("claude-haiku-4-5-20251001");
    expect(result.runner).toBe("claude");
  });

  it("P1: exact snapshot ID for sonnet used as-is", () => {
    const result = resolveModel("claude-sonnet-4-7", tmpDir);
    expect(result.snapshot).toBe("claude-sonnet-4-7");
    expect(result.runner).toBe("claude");
  });

  it("P1: model card without separate snapshot (gpt-4o-mini) resolves key as snapshot", () => {
    const result = resolveModel("gpt-4o-mini", tmpDir);
    expect(result.snapshot).toBe("gpt-4o-mini");
    expect(result.runner).toBe("codex");
  });

  it("P1: unknown model produces clear error listing available models", () => {
    expect(() => resolveModel("llama-3", tmpDir)).toThrow(
      /Unknown model: llama-3\. Available: haiku, sonnet, opus, gpt-4o-mini/,
    );
  });
});

// ---------------------------------------------------------------------------
// STEP 2 — Runner Dispatch
// ---------------------------------------------------------------------------

describe("Runner Dispatch", () => {
  it("P1: claude runner tag dispatches to ClaudeRunner", () => {
    const runner = getRunner("claude");
    expect(runner.name).toBe("claude");
    expect(runner).toBeInstanceOf(ClaudeRunner);
  });

  it("P1: codex runner tag dispatches to CodexRunner", () => {
    const runner = getRunner("codex");
    expect(runner.name).toBe("codex");
    expect(runner).toBeInstanceOf(CodexRunner);
  });

  it("P1: unknown runner tag throws descriptive error", () => {
    expect(() => getRunner("llamacpp")).toThrow(/No runner registered for tag "llamacpp"/);
  });
});

// ---------------------------------------------------------------------------
// STEP 3 — shell: false enforcement (via spawn dependency injection)
// ---------------------------------------------------------------------------

describe("Runner shell: false enforcement", () => {
  it("P0: ClaudeRunner always passes shell: false to spawn", async () => {
    const capturedOpts: Record<string, unknown>[] = [];
    const spawnMock: SpawnFn = (_cmd, _args, opts) => {
      capturedOpts.push(opts);
      return makeFakeProcess({ stdout: "ok", exitCode: 0 });
    };

    // ClaudeRunner accepts an injectable spawn function
    const runner = new ClaudeRunner(spawnMock as Parameters<typeof ClaudeRunner>[0]);
    await runner.exec("hello", "claude-haiku-4-5-20251001", {});

    expect(capturedOpts).toHaveLength(1);
    expect(capturedOpts[0].shell).toBe(false);
  });

  it("P0: CodexRunner always passes shell: false to spawn", async () => {
    const capturedOpts: Record<string, unknown>[] = [];
    const spawnMock: SpawnFn = (_cmd, _args, opts) => {
      capturedOpts.push(opts);
      return makeFakeProcess({ stdout: "ok", exitCode: 0 });
    };

    const runner = new CodexRunner(spawnMock as Parameters<typeof CodexRunner>[0]);
    await runner.exec("hello", "gpt-4o-mini", {});

    expect(capturedOpts).toHaveLength(1);
    expect(capturedOpts[0].shell).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// STEP 4 — Runner binary not found
// ---------------------------------------------------------------------------

describe("Runner binary not found", () => {
  it("P2: CodexRunner ENOENT rejects with clear message", async () => {
    const spawnMock: SpawnFn = () => makeFakeProcess({ errorCode: "ENOENT" });
    const runner = new CodexRunner(spawnMock as Parameters<typeof CodexRunner>[0]);

    await expect(runner.exec("hello", "gpt-4o-mini", {})).rejects.toThrow(
      /codex CLI not found/,
    );
  });

  it("P2: ClaudeRunner ENOENT rejects with clear message", async () => {
    const spawnMock: SpawnFn = () => makeFakeProcess({ errorCode: "ENOENT" });
    const runner = new ClaudeRunner(spawnMock as Parameters<typeof ClaudeRunner>[0]);

    await expect(runner.exec("hello", "claude-haiku-4-5-20251001", {})).rejects.toThrow(
      /claude CLI not found/,
    );
  });
});

// ---------------------------------------------------------------------------
// STEP 5 — Runner override via config
// ---------------------------------------------------------------------------

describe("Runner override via config", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    writeFileSync(join(tmpDir, "models.yaml"), MODELS_YAML_CONTENT);
    clearModelsCache();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    clearModelsCache();
  });

  it("P1: step runner override (runner: codex) returns CodexRunner", () => {
    // speq.config.yaml: steps.implement.runner = "codex"
    // Caller reads StepConfig.runner and passes that tag directly to getRunner()
    const runner = getRunner("codex");
    expect(runner).toBeInstanceOf(CodexRunner);
  });

  it("P1: models.yaml says runner: claude for sonnet, but override uses codex", () => {
    const resolved = resolveModel("sonnet", tmpDir);
    expect(resolved.runner).toBe("claude"); // models.yaml default
    // Override: use codex regardless
    const overrideRunner = getRunner("codex");
    expect(overrideRunner).toBeInstanceOf(CodexRunner);
  });
});

// ---------------------------------------------------------------------------
// STEP 6 — Complexity Routing
// ---------------------------------------------------------------------------

describe("Complexity Routing", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    writeFileSync(join(tmpDir, "models.yaml"), MODELS_YAML_CONTENT);
    clearModelsCache();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    clearModelsCache();
  });

  it("P1: trivial complexity routes to haiku (from models.yaml)", () => {
    const model = resolveComplexityModel("trivial", "sonnet", undefined, tmpDir);
    expect(model).toBe("haiku");
  });

  it("P1: simple complexity routes to haiku", () => {
    const model = resolveComplexityModel("simple", "sonnet", undefined, tmpDir);
    expect(model).toBe("haiku");
  });

  it("P1: standard complexity routes to sonnet", () => {
    const model = resolveComplexityModel("standard", "sonnet", undefined, tmpDir);
    expect(model).toBe("sonnet");
  });

  it("P1: complex complexity routes to sonnet by default (models.yaml)", () => {
    const model = resolveComplexityModel("complex", "sonnet", undefined, tmpDir);
    expect(model).toBe("sonnet");
  });

  it("P1: complex with step override (complexity_routing.complex: opus) picks opus", () => {
    const stepOverrides: Record<string, string> = { complex: "opus" };
    const model = resolveComplexityModel("complex", "sonnet", stepOverrides, tmpDir);
    expect(model).toBe("opus");
    // Verify the resolved snapshot too
    const resolved = resolveModel(model, tmpDir);
    expect(resolved.snapshot).toBe("claude-opus-4-6");
  });

  it("P1: missing complexity label falls back to step default", () => {
    const model = resolveComplexityModel(undefined, "sonnet", undefined, tmpDir);
    expect(model).toBe("sonnet");
  });

  it("P1: unknown complexity label falls back to step default", () => {
    const model = resolveComplexityModel("exotic", "sonnet", undefined, tmpDir);
    expect(model).toBe("sonnet");
  });

  it("P1: trivial -> haiku shorthand resolves to correct snapshot", () => {
    const shorthand = resolveComplexityModel("trivial", "sonnet", undefined, tmpDir);
    expect(shorthand).toBe("haiku");
    const resolved = resolveModel(shorthand, tmpDir);
    expect(resolved.snapshot).toBe("claude-haiku-4-5-20251001");
    expect(resolved.runner).toBe("claude");
  });
});

// ---------------------------------------------------------------------------
// STEP 7 — Performance
// ---------------------------------------------------------------------------

describe("Performance", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    writeFileSync(join(tmpDir, "models.yaml"), MODELS_YAML_CONTENT);
    clearModelsCache();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    clearModelsCache();
  });

  it("P1: model selection + runner selection completes in under 10ms", () => {
    const start = performance.now();
    const resolved = resolveModel("haiku", tmpDir);
    getRunner(resolved.runner);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(10);
  });
});

// ---------------------------------------------------------------------------
// STEP 8 — Idempotency
// ---------------------------------------------------------------------------

describe("Idempotency", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    writeFileSync(join(tmpDir, "models.yaml"), MODELS_YAML_CONTENT);
    clearModelsCache();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    clearModelsCache();
  });

  it("P1: resolveModel returns identical snapshot and runner on repeated calls", () => {
    const first = resolveModel("haiku", tmpDir);
    const second = resolveModel("haiku", tmpDir);
    expect(first.snapshot).toBe(second.snapshot);
    expect(first.runner).toBe(second.runner);
    expect(first.capabilities).toEqual(second.capabilities);
  });

  it("P1: resolveModel returns independent copies (structuredClone)", () => {
    const first = resolveModel("opus", tmpDir);
    const second = resolveModel("opus", tmpDir);
    // Mutating first must not affect second
    first.capabilities.push("extra-capability");
    expect(second.capabilities).not.toContain("extra-capability");
  });

  it("P1: getRunner returns the same runner type on repeated calls", () => {
    const r1 = getRunner("claude");
    const r2 = getRunner("claude");
    expect(r1.name).toBe(r2.name);
    expect(r1).toBeInstanceOf(ClaudeRunner);
    expect(r2).toBeInstanceOf(ClaudeRunner);
  });
});

// ---------------------------------------------------------------------------
// STEP 9 — ClaudeRunner exec via dependency injection
// ---------------------------------------------------------------------------

describe("ClaudeRunner exec", () => {
  it("P1: spawns claude with --model and --prompt args, shell: false", async () => {
    const calls: Array<{ cmd: string; args: string[]; opts: Record<string, unknown> }> = [];
    const spawnMock: SpawnFn = (cmd, args, opts) => {
      calls.push({ cmd, args, opts: opts as Record<string, unknown> });
      return makeFakeProcess({ stdout: "response text", exitCode: 0 });
    };

    const runner = new ClaudeRunner(spawnMock as Parameters<typeof ClaudeRunner>[0]);
    const result = await runner.exec("do the thing", "claude-sonnet-4-7", {});

    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe("claude");
    expect(calls[0].args).toContain("--model");
    expect(calls[0].args).toContain("claude-sonnet-4-7");
    expect(calls[0].opts.shell).toBe(false);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("response text");
  });

  it("P1: uses --prompt-file when promptFile opt is provided", async () => {
    const calls: Array<{ args: string[] }> = [];
    const spawnMock: SpawnFn = (_cmd, args) => {
      calls.push({ args });
      return makeFakeProcess({ stdout: "", exitCode: 0 });
    };

    const runner = new ClaudeRunner(spawnMock as Parameters<typeof ClaudeRunner>[0]);
    await runner.exec("irrelevant", "claude-sonnet-4-7", {
      promptFile: "/tmp/prompt.md",
    });

    expect(calls[0].args).toContain("--prompt-file");
    expect(calls[0].args).toContain("/tmp/prompt.md");
  });

  it("P1: captures stdout and stderr correctly", async () => {
    const spawnMock: SpawnFn = () =>
      makeFakeProcess({ stdout: "output data", stderr: "warn msg", exitCode: 0 });

    const runner = new ClaudeRunner(spawnMock as Parameters<typeof ClaudeRunner>[0]);
    const result = await runner.exec("prompt", "claude-haiku-4-5-20251001", {});

    expect(result.stdout).toBe("output data");
    expect(result.stderr).toBe("warn msg");
    expect(result.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// STEP 10 — CodexRunner exec via dependency injection
// ---------------------------------------------------------------------------

describe("CodexRunner exec", () => {
  it("P1: spawns codex with exec subcommand and shell: false", async () => {
    const calls: Array<{ cmd: string; args: string[]; opts: Record<string, unknown> }> = [];
    const spawnMock: SpawnFn = (cmd, args, opts) => {
      calls.push({ cmd, args, opts: opts as Record<string, unknown> });
      return makeFakeProcess({ stdout: "codex output", exitCode: 0 });
    };

    const runner = new CodexRunner(spawnMock as Parameters<typeof CodexRunner>[0]);
    const result = await runner.exec("do the thing", "gpt-4o-mini", {});

    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe("codex");
    expect(calls[0].args[0]).toBe("exec");
    expect(calls[0].opts.shell).toBe(false);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("codex output");
  });

  it("P1: codex passes model via --model flag", async () => {
    const calls: Array<{ args: string[] }> = [];
    const spawnMock: SpawnFn = (_cmd, args) => {
      calls.push({ args });
      return makeFakeProcess({ exitCode: 0 });
    };

    const runner = new CodexRunner(spawnMock as Parameters<typeof CodexRunner>[0]);
    await runner.exec("prompt", "gpt-4o-mini", {});

    expect(calls[0].args).toContain("--model");
    expect(calls[0].args).toContain("gpt-4o-mini");
  });
});

// ---------------------------------------------------------------------------
// STEP 11 — Runner.supports() contract
// ---------------------------------------------------------------------------

describe("Runner.supports() contract", () => {
  it("ClaudeRunner.supports() returns true for claude- prefixed models", () => {
    const runner = new ClaudeRunner();
    expect(runner.supports("claude-haiku-4-5-20251001")).toBe(true);
    expect(runner.supports("claude-sonnet-4-7")).toBe(true);
    expect(runner.supports("claude-opus-4-6")).toBe(true);
  });

  it("ClaudeRunner.supports() returns false for non-claude models", () => {
    const runner = new ClaudeRunner();
    expect(runner.supports("gpt-4o-mini")).toBe(false);
    expect(runner.supports("llama-3")).toBe(false);
  });

  it("CodexRunner.supports() returns true for gpt- prefixed models", () => {
    const runner = new CodexRunner();
    expect(runner.supports("gpt-4o-mini")).toBe(true);
    expect(runner.supports("gpt-4o")).toBe(true);
  });

  it("CodexRunner.supports() returns true for o1- and o3- prefixed models", () => {
    const runner = new CodexRunner();
    expect(runner.supports("o1-preview")).toBe(true);
    expect(runner.supports("o3-mini")).toBe(true);
  });

  it("CodexRunner.supports() returns false for claude models", () => {
    const runner = new CodexRunner();
    expect(runner.supports("claude-haiku-4-5-20251001")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Sanity: PipelineConfig type import compiles
// ---------------------------------------------------------------------------

describe("PipelineConfig type import", () => {
  it("PipelineConfig type is importable and usable", () => {
    // Just using the type in an assertion so the import is load-bearing
    const cfg: Partial<PipelineConfig> = {
      steps: {
        implement: { model: "haiku", prompt_version: "v1" },
      },
    };
    expect(cfg.steps?.implement?.model).toBe("haiku");
  });
});
