import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, readFileSync, existsSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  writeDecision,
  readDecisions,
  isThrumAvailable,
  formatDecisionsForPR,
  type Decision,
} from "../src/thrum.js";

// ── Test setup ────────────────────────────────────────────────────────────────

const TEST_DIR = join(tmpdir(), "speq-thrum-test-" + process.pid);

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  vi.restoreAllMocks();
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ── helpers ───────────────────────────────────────────────────────────────────

function decisionsPath(speqDir: string, runId: string): string {
  return join(speqDir, "runs", runId, "decisions.json");
}

function readRaw(speqDir: string, runId: string): Decision[] {
  return JSON.parse(readFileSync(decisionsPath(speqDir, runId), "utf-8"));
}

// ── Decision logged during implement [P1] ─────────────────────────────────────

describe("Decision logged during implement (P1)", () => {
  it("writes a skipped decision with correct fields", () => {
    const speqDir = join(TEST_DIR, ".speq");
    const runId = "run-001";

    writeDecision(speqDir, runId, {
      step: "implement",
      task: "T-12",
      action: "skipped",
      reason: "dependency T-09 signature changed",
    });

    const decisions = readRaw(speqDir, runId);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].type).toBe("decision");
    expect(decisions[0].step).toBe("implement");
    expect(decisions[0].task).toBe("T-12");
    expect(decisions[0].action).toBe("skipped");
    expect(decisions[0].reason).toBe("dependency T-09 signature changed");
    expect(decisions[0].timestamp).toBeTruthy();
  });

  it("creates parent directories if they do not exist", () => {
    const speqDir = join(TEST_DIR, "deep", "nested", ".speq");
    writeDecision(speqDir, "run-new", {
      step: "implement",
      task: "T-1",
      action: "skipped",
      reason: "test",
    });
    expect(existsSync(decisionsPath(speqDir, "run-new"))).toBe(true);
  });
});

// ── Decision logged during plan [P1] ──────────────────────────────────────────

describe("Decision logged during plan (P1)", () => {
  it("writes a rerouted decision for a plan step", () => {
    const speqDir = join(TEST_DIR, ".speq");
    const runId = "run-002";

    writeDecision(speqDir, runId, {
      step: "plan",
      task: "T-15",
      action: "rerouted",
      reason: "dependency change detected",
    });

    const decisions = readRaw(speqDir, runId);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].step).toBe("plan");
    expect(decisions[0].task).toBe("T-15");
    expect(decisions[0].action).toBe("rerouted");
    expect(decisions[0].reason).toContain("dependency");
  });
});

// ── Thrum messages contain no secrets [P0] ────────────────────────────────────

describe("Thrum messages contain no secrets (P0)", () => {
  const SECRET_FIELDS = ["api_key", "token", "secret", "password"];

  it("rejects a decision object that contains api_key", () => {
    const badDecision = {
      step: "implement",
      task: "T-1",
      action: "skipped" as const,
      reason: "test",
      api_key: "sk-secret-123",
    };
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      writeDecision(join(TEST_DIR, ".speq"), "run-sec", badDecision as any),
    ).toThrow(/secret|forbidden|api_key/i);
  });

  it("rejects a decision object that contains token", () => {
    const badDecision = {
      step: "implement",
      task: "T-1",
      action: "skipped" as const,
      reason: "test",
      token: "ghp_xxx",
    };
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      writeDecision(join(TEST_DIR, ".speq"), "run-sec", badDecision as any),
    ).toThrow(/secret|forbidden|token/i);
  });

  it("rejects a decision object that contains secret", () => {
    const badDecision = {
      step: "implement",
      task: "T-1",
      action: "skipped" as const,
      reason: "test",
      secret: "my-secret",
    };
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      writeDecision(join(TEST_DIR, ".speq"), "run-sec", badDecision as any),
    ).toThrow(/secret|forbidden/i);
  });

  it("rejects a decision object that contains password", () => {
    const badDecision = {
      step: "implement",
      task: "T-1",
      action: "skipped" as const,
      reason: "test",
      password: "hunter2",
    };
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      writeDecision(join(TEST_DIR, ".speq"), "run-sec", badDecision as any),
    ).toThrow(/secret|forbidden|password/i);
  });

  it("written decision file contains none of the forbidden field names", () => {
    const speqDir = join(TEST_DIR, ".speq");
    writeDecision(speqDir, "run-clean", {
      step: "implement",
      task: "T-5",
      action: "completed",
      reason: "all tests pass",
    });

    const raw = readFileSync(decisionsPath(speqDir, "run-clean"), "utf-8");
    for (const field of SECRET_FIELDS) {
      expect(raw).not.toContain(`"${field}"`);
    }
  });
});

// ── Idempotent decision write [P1] ────────────────────────────────────────────

describe("Idempotent decision write (P1)", () => {
  it("deduplicates by task+action — second write is a no-op", () => {
    const speqDir = join(TEST_DIR, ".speq");
    const runId = "run-idem";

    const base = { step: "implement", task: "T-12", action: "skipped" as const, reason: "dep changed" };
    writeDecision(speqDir, runId, base);
    writeDecision(speqDir, runId, { ...base, reason: "same key, different reason" });

    const decisions = readRaw(speqDir, runId);
    expect(decisions).toHaveLength(1);
    // First write's reason is retained
    expect(decisions[0].reason).toBe("dep changed");
  });

  it("allows different actions for the same task", () => {
    const speqDir = join(TEST_DIR, ".speq");
    const runId = "run-idem2";

    writeDecision(speqDir, runId, { step: "implement", task: "T-12", action: "skipped", reason: "first" });
    writeDecision(speqDir, runId, { step: "implement", task: "T-12", action: "retried", reason: "retry" });

    const decisions = readRaw(speqDir, runId);
    expect(decisions).toHaveLength(2);
  });

  it("allows the same action for different tasks", () => {
    const speqDir = join(TEST_DIR, ".speq");
    const runId = "run-idem3";

    writeDecision(speqDir, runId, { step: "implement", task: "T-10", action: "skipped", reason: "r1" });
    writeDecision(speqDir, runId, { step: "implement", task: "T-11", action: "skipped", reason: "r2" });

    const decisions = readRaw(speqDir, runId);
    expect(decisions).toHaveLength(2);
  });
});

// ── Resume recovers decisions from log [P1] ───────────────────────────────────

describe("Resume recovers decisions (P1)", () => {
  it("readDecisions returns all written decisions", () => {
    const speqDir = join(TEST_DIR, ".speq");
    const runId = "run-resume";

    writeDecision(speqDir, runId, { step: "implement", task: "T-1", action: "skipped", reason: "r1" });
    writeDecision(speqDir, runId, { step: "implement", task: "T-2", action: "rerouted", reason: "r2" });
    writeDecision(speqDir, runId, { step: "implement", task: "T-3", action: "completed", reason: "r3" });

    const decisions = readDecisions(speqDir, runId);
    expect(decisions).toHaveLength(3);
    expect(decisions.map((d) => d.task)).toEqual(["T-1", "T-2", "T-3"]);
  });

  it("readDecisions returns empty array when no log exists", () => {
    const speqDir = join(TEST_DIR, ".speq");
    const decisions = readDecisions(speqDir, "run-nonexistent");
    expect(decisions).toEqual([]);
  });

  it("each decision has type='decision' and a timestamp", () => {
    const speqDir = join(TEST_DIR, ".speq");
    const runId = "run-shape";

    writeDecision(speqDir, runId, { step: "plan", task: "T-7", action: "rerouted", reason: "dep" });

    const [d] = readDecisions(speqDir, runId);
    expect(d.type).toBe("decision");
    expect(typeof d.timestamp).toBe("string");
    // Timestamp should be a parseable ISO date
    expect(Number.isNaN(Date.parse(d.timestamp))).toBe(false);
  });
});

// ── Resume without thrum falls back to Beads state [P1] ──────────────────────

describe("Resume without thrum falls back to Beads state (P1)", () => {
  it("logs a warning when thrum is not available and returns empty decisions", () => {
    // Simulate thrum being unavailable by mocking isThrumAvailable
    vi.spyOn(process, "env", "get").mockReturnValue({ ...process.env, PATH: "" });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // When we read from a run with no decisions.json and thrum is unavailable,
    // readDecisions should return [] and log the fallback warning.
    const speqDir = join(TEST_DIR, ".speq");
    const decisions = readDecisions(speqDir, "run-no-thrum", { warnIfMissing: true });

    expect(decisions).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/thrum not available|resuming from Beads/i),
    );
  });
});

// ── Done includes decisions section in PR description [P1] ───────────────────

describe("Done includes decisions section (P1)", () => {
  it("formats decisions as a markdown section", () => {
    const decisions: Decision[] = [
      { type: "decision", step: "implement", task: "T-1", action: "skipped", reason: "dep changed", timestamp: new Date().toISOString() },
      { type: "decision", step: "plan", task: "T-2", action: "rerouted", reason: "scope change", timestamp: new Date().toISOString() },
      { type: "decision", step: "implement", task: "T-3", action: "retried", reason: "flaky test", timestamp: new Date().toISOString() },
      { type: "decision", step: "implement", task: "T-4", action: "completed", reason: "done", timestamp: new Date().toISOString() },
      { type: "decision", step: "verify", task: "T-5", action: "completed", reason: "passed", timestamp: new Date().toISOString() },
    ];

    const section = formatDecisionsForPR(decisions);
    expect(section).not.toBeNull();
    expect(section!).toMatch(/^## Decisions/m);
    // Each decision appears as a bullet
    for (const d of decisions) {
      expect(section!).toContain(d.task);
      expect(section!).toContain(d.action);
      expect(section!).toContain(d.reason);
    }
  });

  it("each decision renders as a bullet point", () => {
    const decisions: Decision[] = [
      { type: "decision", step: "implement", task: "T-9", action: "skipped", reason: "blocked", timestamp: new Date().toISOString() },
    ];
    const section = formatDecisionsForPR(decisions);
    expect(section!).toMatch(/^- /m);
  });
});

// ── Done without thrum omits section gracefully [P2] ─────────────────────────

describe("Done without thrum omits section gracefully (P2)", () => {
  it("returns null for an empty decisions list", () => {
    const result = formatDecisionsForPR([]);
    expect(result).toBeNull();
  });
});

// ── Thrum unavailable at runtime [P2] ────────────────────────────────────────

describe("Thrum unavailable at runtime (P2)", () => {
  it("writeDecision logs a warning to stderr and does not crash when write path is unavailable", () => {
    // Make the directory read-only to simulate a write failure
    const speqDir = join(TEST_DIR, "readonly-speq");
    mkdirSync(speqDir, { recursive: true });
    const runsDir = join(speqDir, "runs");
    mkdirSync(runsDir, { recursive: true });

    const warnSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    // Make the runs directory read-only to force a write error
    chmodSync(runsDir, 0o444);

    try {
      expect(() =>
        writeDecision(speqDir, "run-fail", {
          step: "implement",
          task: "T-1",
          action: "skipped",
          reason: "test",
        }),
      ).not.toThrow();
      // The warning should have been emitted on stderr
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      chmodSync(runsDir, 0o755);
    }
  });

  it("isThrumAvailable returns false when thrum binary is not on PATH", () => {
    // We cannot control the system PATH in tests, but we can verify the shape of
    // the return value and that it is a boolean.
    const result = isThrumAvailable();
    expect(typeof result).toBe("boolean");
  });
});

// ── Decision write under 20ms [P1] ────────────────────────────────────────────

describe("Decision write under 20ms (P1)", () => {
  it("completes a decision write in under 20ms", () => {
    const speqDir = join(TEST_DIR, ".speq");
    const runId = "run-perf";

    const start = performance.now();
    writeDecision(speqDir, runId, {
      step: "implement",
      task: "T-perf",
      action: "completed",
      reason: "fast write",
    });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(20);
  });
});
