import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  writeStepRecord,
  computeRunSummary,
  generateRunId,
  type StepRecord,
} from "../src/telemetry.js";

const TEST_DIR = join(tmpdir(), "speq-telemetry-test-" + process.pid);

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

function makeRecord(overrides: Partial<StepRecord> = {}): StepRecord {
  return {
    step: "spec",
    model: "claude-haiku-4-5-20251001",
    tokens_in: 1000,
    tokens_out: 200,
    wall_clock_ms: 3500,
    retry_count: 0,
    tool_call_count: 5,
    status: "success",
    source: "exact",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// generateRunId
// ---------------------------------------------------------------------------

describe("generateRunId", () => {
  it("produces a string matching run-YYYYMMDD-HHMMSS format", () => {
    const id = generateRunId();
    expect(id).toMatch(/^run-\d{8}-\d{6}$/);
  });

  it("two calls within 1 second may differ or be equal but are always valid", () => {
    const id1 = generateRunId();
    const id2 = generateRunId();
    expect(id1).toMatch(/^run-\d{8}-\d{6}$/);
    expect(id2).toMatch(/^run-\d{8}-\d{6}$/);
  });
});

// ---------------------------------------------------------------------------
// P1: Record written on step success
// ---------------------------------------------------------------------------

describe("Record written on step success [P1]", () => {
  it("writes spec.json with all required metadata fields", () => {
    const runId = "run-20260513-134500";
    const record = makeRecord({ step: "spec", status: "success" });

    writeStepRecord(TEST_DIR, runId, record);

    const filePath = join(TEST_DIR, ".speq", "runs", runId, "spec.json");
    expect(existsSync(filePath)).toBe(true);

    const parsed = JSON.parse(readFileSync(filePath, "utf-8"));
    expect(parsed.model).toBe("claude-haiku-4-5-20251001");
    expect(typeof parsed.tokens_in).toBe("number");
    expect(typeof parsed.tokens_out).toBe("number");
    expect(typeof parsed.wall_clock_ms).toBe("number");
    expect(typeof parsed.retry_count).toBe("number");
    expect(typeof parsed.tool_call_count).toBe("number");
    expect(parsed.status).toBe("success");
    expect(["exact", "estimated"]).toContain(parsed.source);
  });
});

// ---------------------------------------------------------------------------
// P1: Record written on step failure
// ---------------------------------------------------------------------------

describe("Record written on step failure [P1]", () => {
  it("writes implement.json with status: failed and all metadata fields", () => {
    const runId = "run-20260513-134500";
    const record = makeRecord({
      step: "implement",
      status: "failed",
      tokens_in: 8000,
      tokens_out: 500,
      wall_clock_ms: 12000,
      retry_count: 2,
      tool_call_count: 20,
    });

    writeStepRecord(TEST_DIR, runId, record);

    const filePath = join(TEST_DIR, ".speq", "runs", runId, "implement.json");
    expect(existsSync(filePath)).toBe(true);

    const parsed = JSON.parse(readFileSync(filePath, "utf-8"));
    expect(parsed.status).toBe("failed");
    expect(parsed.tokens_in).toBe(8000);
    expect(parsed.tokens_out).toBe(500);
    expect(parsed.wall_clock_ms).toBe(12000);
    expect(parsed.retry_count).toBe(2);
    expect(parsed.tool_call_count).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// P0: Records contain no prompt or output content
// ---------------------------------------------------------------------------

describe("Records contain no prompt or output content [P0]", () => {
  it("written JSON has no prompt, output, content, or response fields", () => {
    const runId = "run-20260513-134500";
    const record = makeRecord({ step: "enrich" });

    writeStepRecord(TEST_DIR, runId, record);

    const filePath = join(TEST_DIR, ".speq", "runs", runId, "enrich.json");
    const parsed = JSON.parse(readFileSync(filePath, "utf-8"));

    expect(parsed).not.toHaveProperty("prompt");
    expect(parsed).not.toHaveProperty("output");
    expect(parsed).not.toHaveProperty("content");
    expect(parsed).not.toHaveProperty("response");
  });

  it("StepRecord type does not include content fields (structural check via parsed keys)", () => {
    const runId = "run-20260513-134500";
    const record = makeRecord({ step: "verify" });

    writeStepRecord(TEST_DIR, runId, record);

    const filePath = join(TEST_DIR, ".speq", "runs", runId, "verify.json");
    const parsed = JSON.parse(readFileSync(filePath, "utf-8"));
    const allowedKeys = new Set([
      "step",
      "model",
      "tokens_in",
      "tokens_out",
      "wall_clock_ms",
      "retry_count",
      "tool_call_count",
      "status",
      "source",
    ]);
    for (const key of Object.keys(parsed)) {
      expect(allowedKeys.has(key)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// P1: Idempotent step record
// ---------------------------------------------------------------------------

describe("Idempotent step record [P1]", () => {
  it("re-running spec overwrites spec.json without touching other step files", () => {
    const runId = "run-20260513-134500";

    // Write initial spec record
    writeStepRecord(TEST_DIR, runId, makeRecord({ step: "spec", tokens_in: 1000 }));
    // Write enrich record (should not be touched)
    writeStepRecord(TEST_DIR, runId, makeRecord({ step: "enrich", tokens_in: 500 }));

    // Overwrite spec record with new data
    writeStepRecord(TEST_DIR, runId, makeRecord({ step: "spec", tokens_in: 9999 }));

    const specPath = join(TEST_DIR, ".speq", "runs", runId, "spec.json");
    const enrichPath = join(TEST_DIR, ".speq", "runs", runId, "enrich.json");

    const spec = JSON.parse(readFileSync(specPath, "utf-8"));
    const enrich = JSON.parse(readFileSync(enrichPath, "utf-8"));

    expect(spec.tokens_in).toBe(9999);
    expect(enrich.tokens_in).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// P1: Exact source when available
// ---------------------------------------------------------------------------

describe("Exact source when available [P1]", () => {
  it("records source: exact when caller specifies exact", () => {
    const runId = "run-20260513-134500";
    const record = makeRecord({ step: "plan", source: "exact", tokens_in: 3000, tokens_out: 400 });

    writeStepRecord(TEST_DIR, runId, record);

    const filePath = join(TEST_DIR, ".speq", "runs", runId, "plan.json");
    const parsed = JSON.parse(readFileSync(filePath, "utf-8"));
    expect(parsed.source).toBe("exact");
    expect(parsed.tokens_in).toBe(3000);
    expect(parsed.tokens_out).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// P1: Estimated fallback
// ---------------------------------------------------------------------------

describe("Estimated fallback [P1]", () => {
  it("records source: estimated when caller specifies estimated", () => {
    const runId = "run-20260513-134500";
    // Simulate estimated: chars/4 heuristic — 4000 chars input -> 1000 tokens_in
    const record = makeRecord({
      step: "done",
      source: "estimated",
      tokens_in: 1000,
      tokens_out: 125,
    });

    writeStepRecord(TEST_DIR, runId, record);

    const filePath = join(TEST_DIR, ".speq", "runs", runId, "done.json");
    const parsed = JSON.parse(readFileSync(filePath, "utf-8"));
    expect(parsed.source).toBe("estimated");
    expect(parsed.tokens_in).toBe(1000);
    expect(parsed.tokens_out).toBe(125);
  });
});

// ---------------------------------------------------------------------------
// P1: Summary computed from step records
// ---------------------------------------------------------------------------

describe("Summary computed from step records [P1]", () => {
  it("produces summary.json with correct totals for a complete run", () => {
    const runId = "run-20260513-134500";
    const steps = ["enrich", "spec", "plan", "implement", "verify", "done"] as const;

    for (const step of steps) {
      writeStepRecord(
        TEST_DIR,
        runId,
        makeRecord({
          step,
          tokens_in: 1000,
          tokens_out: 200,
          wall_clock_ms: 5000,
          status: "success",
        }),
      );
    }

    const summary = computeRunSummary(TEST_DIR, runId);

    expect(summary.run_id).toBe(runId);
    expect(summary.total_tokens_in).toBe(6000);
    expect(summary.total_tokens_out).toBe(1200);
    expect(summary.total_wall_clock_ms).toBe(30000);
    expect(summary.step_count).toBe(6);
    expect(summary.completed_steps).toBe(6);
    expect(summary.status).toBe("pass");
    expect(typeof summary.estimated_cost_usd).toBe("number");
    expect(summary.estimated_cost_usd).toBeGreaterThan(0);
  });

  it("writes summary.json to the run directory", () => {
    const runId = "run-20260513-134500";
    writeStepRecord(TEST_DIR, runId, makeRecord({ step: "spec", status: "success" }));

    computeRunSummary(TEST_DIR, runId);

    const summaryPath = join(TEST_DIR, ".speq", "runs", runId, "summary.json");
    expect(existsSync(summaryPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(summaryPath, "utf-8"));
    expect(parsed.run_id).toBe(runId);
  });
});

// ---------------------------------------------------------------------------
// P2: Partial rollup on incomplete run
// ---------------------------------------------------------------------------

describe("Partial rollup on incomplete run [P2]", () => {
  it("summarises only completed steps when pipeline failed mid-run", () => {
    const runId = "run-20260513-134500";

    writeStepRecord(TEST_DIR, runId, makeRecord({ step: "enrich", status: "success" }));
    writeStepRecord(TEST_DIR, runId, makeRecord({ step: "spec", status: "success" }));
    writeStepRecord(TEST_DIR, runId, makeRecord({ step: "plan", status: "success" }));
    // implement failed — only 3 steps written

    const summary = computeRunSummary(TEST_DIR, runId);

    expect(summary.step_count).toBe(3);
    expect(summary.completed_steps).toBe(3);
    // All 3 completed successfully, so pass
    expect(summary.status).toBe("pass");
  });

  it("marks status as failed when at least one step has status: failed", () => {
    const runId = "run-20260513-134500";

    writeStepRecord(TEST_DIR, runId, makeRecord({ step: "enrich", status: "success" }));
    writeStepRecord(TEST_DIR, runId, makeRecord({ step: "spec", status: "success" }));
    writeStepRecord(TEST_DIR, runId, makeRecord({ step: "implement", status: "failed" }));

    const summary = computeRunSummary(TEST_DIR, runId);

    expect(summary.step_count).toBe(3);
    expect(summary.completed_steps).toBe(2); // only success steps count as completed
    expect(summary.status).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// P1: Record write under 50ms
// ---------------------------------------------------------------------------

describe("Record write under 50ms [P1]", () => {
  it("writes a step record in less than 50ms", () => {
    const runId = "run-20260513-134500";
    const record = makeRecord({ step: "spec" });

    const start = Date.now();
    writeStepRecord(TEST_DIR, runId, record);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(50);
  });
});

// ---------------------------------------------------------------------------
// P2: Filesystem failure graceful degrade
// ---------------------------------------------------------------------------

describe("Filesystem failure graceful degrade [P2]", () => {
  it("logs a warning to stderr and does not throw when the runs dir is not writable", () => {
    // Create the .speq/runs dir and lock it down
    const runsDir = join(TEST_DIR, ".speq", "runs");
    mkdirSync(runsDir, { recursive: true });
    chmodSync(runsDir, 0o444); // read-only

    const stderrMessages: string[] = [];
    const origStderrWrite = process.stderr.write.bind(process.stderr);
    // @ts-expect-error — patching for test
    process.stderr.write = (chunk: string) => {
      stderrMessages.push(chunk.toString());
      return true;
    };

    try {
      // Should not throw
      expect(() => {
        writeStepRecord(TEST_DIR, "run-20260513-134500", makeRecord({ step: "spec" }));
      }).not.toThrow();

      expect(stderrMessages.some((m) => m.toLowerCase().includes("warn"))).toBe(true);
    } finally {
      // Restore stderr and fix permissions so afterEach cleanup can rm the dir
      process.stderr.write = origStderrWrite;
      chmodSync(runsDir, 0o755);
    }
  });
});
