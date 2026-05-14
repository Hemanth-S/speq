import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawnSync: vi.fn(actual.spawnSync),
  };
});

import * as childProcess from "node:child_process";
import { run, runBoard } from "../src/cli.js";

let tmpDir: string;

function writeMinimalConfig(dir: string): void {
  writeFileSync(
    join(dir, "speq.config.yaml"),
    "steps:\n  implement:\n    model: sonnet\n    prompt_version: v1\n",
    "utf-8",
  );
}

function mockBdEmpty(): void {
  const spawnSyncMock = vi.mocked(childProcess.spawnSync);
  spawnSyncMock.mockReturnValue({
    status: 0,
    stdout: Buffer.from("[]"),
    stderr: Buffer.from(""),
    pid: 1,
    output: [],
    signal: null,
  });
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "speq-cli-board-test-"));
  vi.clearAllMocks();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("board command in CLI [P1]", () => {
  it("recognizes board as a valid command (no Unknown command error)", () => {
    mockBdEmpty();
    writeMinimalConfig(tmpDir);

    const result = run(["board"], { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain("Unknown command");
  });

  it("includes board in --help output", () => {
    const result = run(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("board");
  });
});

describe("runBoard [P1]", () => {
  it("writes .speq/board.html to the given cwd", () => {
    mockBdEmpty();
    writeMinimalConfig(tmpDir);

    const result = runBoard(tmpDir);

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(tmpDir, ".speq", "board.html"))).toBe(true);
  });

  it("returns the board path in stdout so users can open it", () => {
    mockBdEmpty();
    writeMinimalConfig(tmpDir);

    const result = runBoard(tmpDir);

    expect(result.stdout).toContain(".speq/board.html");
  });

  it("creates .speq directory if missing", () => {
    mockBdEmpty();
    writeMinimalConfig(tmpDir);
    expect(existsSync(join(tmpDir, ".speq"))).toBe(false);

    runBoard(tmpDir);

    expect(existsSync(join(tmpDir, ".speq", "board.html"))).toBe(true);
  });

  it("rendered HTML is self-contained (has DOCTYPE)", () => {
    mockBdEmpty();
    writeMinimalConfig(tmpDir);

    runBoard(tmpDir);

    const contents = readFileSync(join(tmpDir, ".speq", "board.html"), "utf-8");
    expect(contents).toMatch(/<!DOCTYPE html>/i);
  });

  it("returns exitCode 1 and an error message when the project dir is unwritable", () => {
    mockBdEmpty();
    writeMinimalConfig(tmpDir);
    // Create .speq as a regular file so mkdirSync inside writeBoard fails.
    mkdirSync(join(tmpDir, ".speq"), { recursive: true });
    // Replace the directory with a file by removing then writing.
    rmSync(join(tmpDir, ".speq"), { recursive: true, force: true });
    writeFileSync(join(tmpDir, ".speq"), "blocker", "utf-8");

    const result = runBoard(tmpDir);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.length).toBeGreaterThan(0);
    // Must not leak stack traces / internal paths
    expect(result.stderr).not.toMatch(/at\s+\w+\s+\(/);
  });
});
