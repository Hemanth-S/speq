import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// We need to mock spawnSync before importing the module under test.
// Use vi.mock with a factory to intercept child_process.
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawnSync: vi.fn(actual.spawnSync),
  };
});

import * as childProcess from "node:child_process";
import { gatherBoardData, renderBoard, writeBoard, type BoardData } from "../src/board.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "speq-board-test-"));
}

/** Write a minimal speq.config.yaml into tmpDir. */
function writeConfig(dir: string, extra = ""): void {
  const yaml = `steps:\n  implement:\n    model: sonnet\n    prompt_version: v1\n  spec:\n    prompt_version: v2\n${extra}`;
  writeFileSync(join(dir, "speq.config.yaml"), yaml, "utf-8");
}

/** Create a run directory with a summary.json. */
function writeRunSummary(
  dir: string,
  runId: string,
  overrides: Partial<{
    total_tokens_in: number;
    total_tokens_out: number;
    total_wall_clock_ms: number;
    estimated_cost_usd: number;
    status: string;
  }> = {},
): void {
  const runDir = join(dir, ".speq", "runs", runId);
  mkdirSync(runDir, { recursive: true });
  const summary = {
    run_id: runId,
    total_tokens_in: 50000,
    total_tokens_out: 20000,
    total_wall_clock_ms: 45000,
    step_count: 3,
    completed_steps: 3,
    status: "pass",
    estimated_cost_usd: 1.25,
    ...overrides,
  };
  writeFileSync(join(runDir, "summary.json"), JSON.stringify(summary, null, 2), "utf-8");
}

/** Write step record files for a run (to determine current step). */
function writeStepRecords(dir: string, runId: string, steps: string[]): void {
  const runDir = join(dir, ".speq", "runs", runId);
  mkdirSync(runDir, { recursive: true });
  for (const step of steps) {
    const record = {
      step,
      model: "haiku",
      tokens_in: 1000,
      tokens_out: 200,
      wall_clock_ms: 3000,
      retry_count: 0,
      tool_call_count: 5,
      status: "success",
      source: "exact",
    };
    writeFileSync(join(runDir, `${step}.json`), JSON.stringify(record, null, 2), "utf-8");
  }
}

/** Mock bd list to return issues JSON output. */
function mockBdListSuccess(
  issues: { id: string; title: string; status: string; complexity?: string }[],
): void {
  const spawnSyncMock = vi.mocked(childProcess.spawnSync);
  spawnSyncMock.mockReturnValueOnce({
    status: 0,
    stdout: Buffer.from(JSON.stringify(issues)),
    stderr: Buffer.from(""),
    pid: 1,
    output: [],
    signal: null,
  });
}

/** Mock bd list to fail (bd not found). */
function mockBdListFailure(): void {
  const spawnSyncMock = vi.mocked(childProcess.spawnSync);
  spawnSyncMock.mockReturnValueOnce({
    status: 1,
    stdout: Buffer.from(""),
    stderr: Buffer.from("bd: command not found"),
    pid: 1,
    output: [],
    signal: null,
    error: new Error("ENOENT"),
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = makeTmpDir();
  vi.clearAllMocks();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// P1: Current step highlighted in HTML output
// ---------------------------------------------------------------------------

describe("Current step highlighted [P1]", () => {
  it("marks implement as active and enrich/spec/plan as complete when those step records exist", () => {
    writeConfig(tmpDir);
    const runId = "run-20260513-120000";
    writeStepRecords(tmpDir, runId, ["enrich", "spec", "plan"]);
    mockBdListSuccess([]);

    const data = gatherBoardData(tmpDir);

    const enrichStep = data.steps.find((s) => s.name === "enrich");
    const specStep = data.steps.find((s) => s.name === "spec");
    const planStep = data.steps.find((s) => s.name === "plan");
    const implementStep = data.steps.find((s) => s.name === "implement");
    const verifyStep = data.steps.find((s) => s.name === "verify");

    expect(enrichStep?.status).toBe("complete");
    expect(specStep?.status).toBe("complete");
    expect(planStep?.status).toBe("complete");
    expect(implementStep?.status).toBe("active");
    expect(verifyStep?.status).toBe("pending");

    const html = renderBoard(data);
    // The implement lane must have an active marker in the HTML
    expect(html).toMatch(/implement[\s\S]{0,200}active|active[\s\S]{0,200}implement/i);
  });

  it("renders all 6 pipeline lanes in the HTML", () => {
    writeConfig(tmpDir);
    mockBdListSuccess([]);

    const data = gatherBoardData(tmpDir);
    const html = renderBoard(data);

    for (const step of ["enrich", "spec", "plan", "implement", "verify", "done"]) {
      expect(html.toLowerCase()).toContain(step);
    }
  });

  it("has exactly 6 steps in the data model", () => {
    writeConfig(tmpDir);
    mockBdListSuccess([]);

    const data = gatherBoardData(tmpDir);
    expect(data.steps).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// P1: Beads issue cards rendered with status/complexity
// ---------------------------------------------------------------------------

describe("Beads issue cards rendered [P1]", () => {
  it("renders 5 issue cards with id, title, status, and complexity", () => {
    writeConfig(tmpDir);

    const issues = [
      { id: "BD-1", title: "Setup CI pipeline", status: "open", complexity: "S" },
      { id: "BD-2", title: "Add auth module", status: "in-progress", complexity: "L" },
      { id: "BD-3", title: "Write unit tests", status: "open", complexity: "M" },
      { id: "BD-4", title: "Deploy to staging", status: "closed", complexity: "XL" },
      { id: "BD-5", title: "Fix login bug", status: "open", complexity: "S" },
    ];
    mockBdListSuccess(issues);

    const data = gatherBoardData(tmpDir);

    expect(data.issues).toHaveLength(5);
    expect(data.issues[0]).toMatchObject({ id: "BD-1", title: "Setup CI pipeline", status: "open", complexity: "S" });
    expect(data.issues[1]).toMatchObject({ id: "BD-2", status: "in-progress", complexity: "L" });

    const html = renderBoard(data);
    for (const issue of issues) {
      expect(html).toContain(issue.id);
      expect(html).toContain(issue.title);
      expect(html).toContain(issue.status);
    }
  });

  it("renders complexity labels in HTML cards", () => {
    writeConfig(tmpDir);
    mockBdListSuccess([
      { id: "BD-10", title: "Big task", status: "open", complexity: "XL" },
    ]);

    const data = gatherBoardData(tmpDir);
    const html = renderBoard(data);

    expect(html).toContain("BD-10");
    expect(html).toContain("XL");
  });
});

// ---------------------------------------------------------------------------
// P1: Config panel reflects current settings
// ---------------------------------------------------------------------------

describe("Config panel reflects current settings [P1]", () => {
  it("shows implement model and spec prompt_version from speq.config.yaml", () => {
    writeConfig(tmpDir);
    mockBdListSuccess([]);

    const data = gatherBoardData(tmpDir);

    const implementRow = data.config.find((c) => c.step === "implement");
    const specRow = data.config.find((c) => c.step === "spec");

    expect(implementRow?.model).toBe("sonnet");
    expect(specRow?.prompt_version).toBe("v2");

    const html = renderBoard(data);
    expect(html).toContain("sonnet");
    expect(html).toContain("v2");
    // Confirm config panel section exists
    expect(html.toLowerCase()).toMatch(/config|configuration/);
  });

  it("reflects updated model when config changes from sonnet to opus", () => {
    writeFileSync(
      join(tmpDir, "speq.config.yaml"),
      "steps:\n  implement:\n    model: opus\n    prompt_version: v1\n",
      "utf-8",
    );
    mockBdListSuccess([]);

    const data = gatherBoardData(tmpDir);
    const implementRow = data.config.find((c) => c.step === "implement");

    expect(implementRow?.model).toBe("opus");

    const html = renderBoard(data);
    expect(html).toContain("opus");
  });
});

// ---------------------------------------------------------------------------
// P1: Cost data displayed from run summary
// ---------------------------------------------------------------------------

describe("Cost data displayed [P1]", () => {
  it("reads tokens_in, tokens_out, cost_usd, and wall_clock_ms from summary.json", () => {
    writeConfig(tmpDir);
    const runId = "run-20260513-120000";
    writeRunSummary(tmpDir, runId, {
      total_tokens_in: 50000,
      total_tokens_out: 20000,
      estimated_cost_usd: 1.25,
      total_wall_clock_ms: 45000,
    });
    mockBdListSuccess([]);

    const data = gatherBoardData(tmpDir);

    expect(data.cost).toBeDefined();
    expect(data.cost?.tokens_in).toBe(50000);
    expect(data.cost?.tokens_out).toBe(20000);
    expect(data.cost?.estimated_cost_usd).toBe(1.25);
    expect(data.cost?.wall_clock_ms).toBe(45000);

    const html = renderBoard(data);
    expect(html).toContain("50000");
    expect(html).toContain("20000");
    expect(html).toContain("1.25");
  });

  it("renders run history from .speq/runs/ directory", () => {
    writeConfig(tmpDir);
    for (const [runId, cost] of [
      ["run-20260511-080000", 0.50],
      ["run-20260512-090000", 0.75],
      ["run-20260513-100000", 1.25],
    ] as const) {
      writeRunSummary(tmpDir, runId, { estimated_cost_usd: cost });
    }
    mockBdListSuccess([]);

    const data = gatherBoardData(tmpDir);

    expect(data.runHistory.length).toBeGreaterThanOrEqual(3);
    const runIds = data.runHistory.map((r) => r.run_id);
    expect(runIds).toContain("run-20260511-080000");
    expect(runIds).toContain("run-20260512-090000");
    expect(runIds).toContain("run-20260513-100000");
  });
});

// ---------------------------------------------------------------------------
// P0: Board contains no secrets
// ---------------------------------------------------------------------------

describe("Board contains no secrets [P0]", () => {
  it("does not include process.env values in rendered HTML", () => {
    writeConfig(tmpDir);
    mockBdListSuccess([]);

    // Set a fake env var with a recognisable secret value
    const secretValue = "sk-super-secret-api-key-12345";
    process.env["SPEQ_TEST_SECRET"] = secretValue;

    try {
      const data = gatherBoardData(tmpDir);
      const html = renderBoard(data);
      expect(html).not.toContain(secretValue);
    } finally {
      delete process.env["SPEQ_TEST_SECRET"];
    }
  });

  it("does not include any process.env values that look like API keys", () => {
    writeConfig(tmpDir);
    mockBdListSuccess([]);

    const fakeApiKey = "ANTHROPIC_API_KEY_VALUE_abc123xyz";
    process.env["ANTHROPIC_API_KEY"] = fakeApiKey;

    try {
      const data = gatherBoardData(tmpDir);
      const html = renderBoard(data);
      expect(html).not.toContain(fakeApiKey);
    } finally {
      delete process.env["ANTHROPIC_API_KEY"];
    }
  });

  it("does not leak env var names that look like secrets into the HTML", () => {
    writeConfig(tmpDir);
    mockBdListSuccess([]);

    const data = gatherBoardData(tmpDir);
    const html = renderBoard(data);

    // Confirm no process.env dump occurred by checking a few sensitive var names
    // that would appear if someone did JSON.stringify(process.env)
    expect(html).not.toMatch(/ANTHROPIC_API_KEY\s*[:=]\s*\S/);
    expect(html).not.toMatch(/OPENAI_API_KEY\s*[:=]\s*\S/);
  });
});

// ---------------------------------------------------------------------------
// P1: Board is self-contained HTML
// ---------------------------------------------------------------------------

describe("Board is self-contained HTML [P1]", () => {
  it("produces valid HTML with DOCTYPE and html/head/body tags", () => {
    writeConfig(tmpDir);
    mockBdListSuccess([]);

    const data = gatherBoardData(tmpDir);
    const html = renderBoard(data);

    expect(html).toMatch(/<!DOCTYPE html>/i);
    expect(html).toMatch(/<html[\s>]/i);
    expect(html).toMatch(/<head[\s>]/i);
    expect(html).toMatch(/<body[\s>]/i);
    expect(html).toMatch(/<\/html>/i);
  });

  it("contains inlined CSS (no external stylesheet link tags)", () => {
    writeConfig(tmpDir);
    mockBdListSuccess([]);

    const data = gatherBoardData(tmpDir);
    const html = renderBoard(data);

    // Must have inlined <style> block
    expect(html).toMatch(/<style[\s>]/i);

    // Must NOT have <link rel="stylesheet" href="http..."> external stylesheets
    const externalStylesheets = html.match(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']https?:\/\//gi);
    expect(externalStylesheets).toBeNull();
  });

  it("contains no external image or font src URLs", () => {
    writeConfig(tmpDir);
    mockBdListSuccess([]);

    const data = gatherBoardData(tmpDir);
    const html = renderBoard(data);

    // No src="http..." in img/script tags
    const externalSrcs = html.match(/<(?:img|script)[^>]+src=["']https?:\/\//gi);
    expect(externalSrcs).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// P1: Render under 2s
// ---------------------------------------------------------------------------

describe("Render under 2s [P1]", () => {
  it("renders a board with 80 issues and 5 historical runs in under 2000ms", () => {
    writeConfig(tmpDir);

    // Create 5 run summaries
    for (let i = 1; i <= 5; i++) {
      const runId = `run-2026051${i}-100000`;
      writeRunSummary(tmpDir, runId, { estimated_cost_usd: i * 0.25 });
    }

    // 80 fake issues
    const issues = Array.from({ length: 80 }, (_, i) => ({
      id: `BD-${i + 1}`,
      title: `Issue number ${i + 1} with a longer title to stress test rendering`,
      status: i % 3 === 0 ? "open" : i % 3 === 1 ? "in-progress" : "closed",
      complexity: ["S", "M", "L", "XL"][i % 4],
    }));
    mockBdListSuccess(issues);

    const start = Date.now();
    const data = gatherBoardData(tmpDir);
    const html = renderBoard(data);
    const elapsed = Date.now() - start;

    expect(html.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(2000);
  });

  it("writeBoard writes .speq/board.html in under 2000ms", () => {
    writeConfig(tmpDir);
    mockBdListSuccess([]);

    const start = Date.now();
    writeBoard(tmpDir);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(2000);
    expect(existsSync(join(tmpDir, ".speq", "board.html"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// P1: Idempotent render
// ---------------------------------------------------------------------------

describe("Idempotent render [P1]", () => {
  it("produces identical HTML when called twice with same state", () => {
    writeConfig(tmpDir);
    const runId = "run-20260513-120000";
    writeRunSummary(tmpDir, runId);
    mockBdListSuccess([{ id: "BD-1", title: "Task one", status: "open", complexity: "S" }]);

    const data1 = gatherBoardData(tmpDir);
    const html1 = renderBoard(data1);

    // Reset mock for second call
    mockBdListSuccess([{ id: "BD-1", title: "Task one", status: "open", complexity: "S" }]);

    const data2 = gatherBoardData(tmpDir);
    const html2 = renderBoard(data2);

    expect(html1).toBe(html2);
  });

  it("renderBoard is deterministic given the same BoardData object", () => {
    const data: BoardData = {
      currentStep: "implement",
      steps: [
        { name: "enrich", status: "complete" },
        { name: "spec", status: "complete" },
        { name: "plan", status: "complete" },
        { name: "implement", status: "active" },
        { name: "verify", status: "pending" },
        { name: "done", status: "pending" },
      ],
      issues: [{ id: "BD-42", title: "Fixed issue", status: "closed", complexity: "M" }],
      config: [{ step: "implement", model: "sonnet", prompt_version: "v1" }],
      cost: { tokens_in: 10000, tokens_out: 5000, estimated_cost_usd: 0.5, wall_clock_ms: 12000 },
      runHistory: [{ run_id: "run-20260513-120000", timestamp: "2026-05-13T12:00:00Z", status: "pass", cost_usd: 0.5 }],
    };

    const html1 = renderBoard(data);
    const html2 = renderBoard(data);

    expect(html1).toBe(html2);
  });
});

// ---------------------------------------------------------------------------
// P2: Beads unavailable graceful degrade
// ---------------------------------------------------------------------------

describe("Beads unavailable graceful degrade [P2]", () => {
  it("returns empty issues array when bd is not found", () => {
    writeConfig(tmpDir);
    mockBdListFailure();

    const data = gatherBoardData(tmpDir);

    expect(data.issues).toEqual([]);
  });

  it("renders pipeline lanes and config panel even when bd fails", () => {
    writeConfig(tmpDir);
    mockBdListFailure();

    const data = gatherBoardData(tmpDir);
    const html = renderBoard(data);

    // Pipeline lanes still present
    for (const step of ["enrich", "spec", "plan", "implement", "verify", "done"]) {
      expect(html.toLowerCase()).toContain(step);
    }

    // Config panel present
    expect(html.toLowerCase()).toMatch(/config|configuration/);

    // Shows unavailability message in issues section
    expect(html.toLowerCase()).toContain("beads unavailable");

    // No crash — html is a non-empty string
    expect(html.length).toBeGreaterThan(200);
  });

  it("does not throw when bd returns non-zero exit code", () => {
    writeConfig(tmpDir);
    mockBdListFailure();

    expect(() => gatherBoardData(tmpDir)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// writeBoard integration
// ---------------------------------------------------------------------------

describe("writeBoard integration", () => {
  it("writes .speq/board.html to the project directory", () => {
    writeConfig(tmpDir);
    mockBdListSuccess([{ id: "BD-1", title: "Test issue", status: "open" }]);

    writeBoard(tmpDir);

    const boardPath = join(tmpDir, ".speq", "board.html");
    expect(existsSync(boardPath)).toBe(true);

    const contents = readFileSync(boardPath, "utf-8");
    expect(contents).toMatch(/<!DOCTYPE html>/i);
    expect(contents).toContain("BD-1");
    expect(contents).toContain("Test issue");
  });

  it("creates .speq directory if it does not exist", () => {
    writeConfig(tmpDir);
    mockBdListSuccess([]);

    // Ensure .speq doesn't exist
    expect(existsSync(join(tmpDir, ".speq"))).toBe(false);

    writeBoard(tmpDir);

    expect(existsSync(join(tmpDir, ".speq", "board.html"))).toBe(true);
  });

  it("overwrites existing board.html on subsequent writes", () => {
    writeConfig(tmpDir);
    mockBdListSuccess([{ id: "BD-1", title: "First render", status: "open" }]);
    writeBoard(tmpDir);

    mockBdListSuccess([{ id: "BD-2", title: "Second render", status: "open" }]);
    writeBoard(tmpDir);

    const boardPath = join(tmpDir, ".speq", "board.html");
    const contents = readFileSync(boardPath, "utf-8");
    expect(contents).toContain("BD-2");
    expect(contents).toContain("Second render");
  });
});
