import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  shouldElideStep,
  writeElisionLog,
  loadModelCapabilities,
  type ElisionDecision,
} from "../src/step-elision.js";

// ── helpers ──────────────────────────────────────────────────────────────────

const TEST_DIR = join(tmpdir(), "speq-step-elision-test-" + process.pid);

function makeModelsYaml(entries: Record<string, { capabilities?: string[] }>): string {
  const modelsBlock = Object.entries(entries)
    .map(([name, cfg]) => {
      const capLine =
        cfg.capabilities !== undefined
          ? `    capabilities: [${cfg.capabilities.join(", ")}]`
          : "";
      return `  ${name}:\n    snapshot: ${name}-snap\n    runner: claude\n${capLine}`;
    })
    .join("\n");
  return `models:\n${modelsBlock}\n`;
}

function elisionLogPath(speqDir: string, runId: string): string {
  return join(speqDir, "runs", runId, "elisions.json");
}

// ── setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ── shouldElideStep ───────────────────────────────────────────────────────────

describe("shouldElideStep", () => {
  it("elides step when model has matching capability (P1)", () => {
    const decision = shouldElideStep(
      "verify",
      { skip_if: "capability >= verify-native" },
      ["verify-native"],
    );
    expect(decision.step).toBe("verify");
    expect(decision.action).toBe("elided");
    expect(decision.reason).toContain("verify-native");
  });

  it("executes step when model lacks the required capability (P1)", () => {
    const decision = shouldElideStep(
      "verify",
      { skip_if: "capability >= verify-native" },
      [],
    );
    expect(decision.action).toBe("executed");
  });

  it("executes step when capabilities list does not include the required one (P1)", () => {
    const decision = shouldElideStep(
      "verify",
      { skip_if: "capability >= verify-native" },
      ["some-other-capability"],
    );
    expect(decision.action).toBe("executed");
  });

  it("executes step when skip_if is absent, regardless of capabilities (P1)", () => {
    const decision = shouldElideStep("spec", {}, ["verify-native", "spec-native"]);
    expect(decision.action).toBe("executed");
    expect(decision.reason).toBeUndefined();
  });

  it("security gate flag is true even when step is elided (P0)", () => {
    const decision = shouldElideStep(
      "verify",
      { skip_if: "capability >= verify-native" },
      ["verify-native"],
    );
    expect(decision.action).toBe("elided");
    // Security sub-gate must still run: the decision must expose this flag
    expect(decision.runSecurityGate).toBe(true);
  });

  it("security gate flag is true when step executes normally (P0 baseline)", () => {
    const decision = shouldElideStep(
      "verify",
      { skip_if: "capability >= verify-native" },
      [],
    );
    expect(decision.runSecurityGate).toBe(true);
  });
});

// ── writeElisionLog ───────────────────────────────────────────────────────────

describe("writeElisionLog", () => {
  it("writes elisions.json to the correct run directory (P1)", () => {
    const speqDir = join(TEST_DIR, ".speq");
    const runId = "run-abc";
    const decisions: ElisionDecision[] = [
      { step: "verify", action: "elided", reason: "capability verify-native", runSecurityGate: true },
    ];

    writeElisionLog(speqDir, runId, decisions);

    const logPath = elisionLogPath(speqDir, runId);
    expect(existsSync(logPath)).toBe(true);

    const parsed = JSON.parse(readFileSync(logPath, "utf-8"));
    expect(parsed).toEqual(decisions);
  });

  it("creates parent directories if they do not exist (P1)", () => {
    const speqDir = join(TEST_DIR, "deep", ".speq");
    writeElisionLog(speqDir, "run-xyz", []);
    expect(existsSync(join(speqDir, "runs", "run-xyz", "elisions.json"))).toBe(true);
  });

  it("idempotent: run X and run Y have independent logs (P1)", () => {
    const speqDir = join(TEST_DIR, ".speq");
    const decisionsX: ElisionDecision[] = [
      { step: "verify", action: "elided", reason: "capability verify-native", runSecurityGate: true },
    ];
    const decisionsY: ElisionDecision[] = [
      { step: "verify", action: "elided", reason: "capability verify-native", runSecurityGate: true },
    ];

    writeElisionLog(speqDir, "run-X", decisionsX);
    writeElisionLog(speqDir, "run-Y", decisionsY);

    const logX = JSON.parse(readFileSync(elisionLogPath(speqDir, "run-X"), "utf-8"));
    const logY = JSON.parse(readFileSync(elisionLogPath(speqDir, "run-Y"), "utf-8"));

    // Both have the same content …
    expect(logX).toEqual(decisionsX);
    expect(logY).toEqual(decisionsY);

    // … but are independent files: mutating one doesn't affect the other
    writeElisionLog(speqDir, "run-X", []); // overwrite run-X with empty
    const logXAfter = JSON.parse(readFileSync(elisionLogPath(speqDir, "run-X"), "utf-8"));
    const logYAfter = JSON.parse(readFileSync(elisionLogPath(speqDir, "run-Y"), "utf-8"));
    expect(logXAfter).toEqual([]);
    expect(logYAfter).toEqual(decisionsY); // run-Y unchanged
  });
});

// ── loadModelCapabilities ─────────────────────────────────────────────────────

describe("loadModelCapabilities", () => {
  it("returns capabilities array for a model that declares them", () => {
    writeFileSync(
      join(TEST_DIR, "models.yaml"),
      makeModelsYaml({ opus: { capabilities: ["verify-native"] } }),
    );
    const caps = loadModelCapabilities(TEST_DIR, "opus");
    expect(caps).toEqual(["verify-native"]);
  });

  it("returns empty array for a model with empty capabilities list", () => {
    writeFileSync(
      join(TEST_DIR, "models.yaml"),
      makeModelsYaml({ sonnet: { capabilities: [] } }),
    );
    const caps = loadModelCapabilities(TEST_DIR, "sonnet");
    expect(caps).toEqual([]);
  });

  it("returns empty array and warns when model has no capabilities field (P2)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    writeFileSync(
      join(TEST_DIR, "models.yaml"),
      makeModelsYaml({ haiku: {} }), // no capabilities field
    );
    const caps = loadModelCapabilities(TEST_DIR, "haiku");
    expect(caps).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("capabilities"),
    );
  });

  it("returns empty array and warns when models.yaml is missing (P2 fallback)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // No models.yaml written to TEST_DIR
    const caps = loadModelCapabilities(TEST_DIR, "opus");
    expect(caps).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("returns empty array and warns when model name is not found in models.yaml (P2)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    writeFileSync(
      join(TEST_DIR, "models.yaml"),
      makeModelsYaml({ opus: { capabilities: ["verify-native"] } }),
    );
    const caps = loadModelCapabilities(TEST_DIR, "unknown-model");
    expect(caps).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
  });
});

// ── Integration: full elision pipeline ───────────────────────────────────────

describe("integration: shouldElideStep + writeElisionLog", () => {
  it("elides verify when capability present, logs to correct run dir", () => {
    const speqDir = join(TEST_DIR, ".speq");

    const decision = shouldElideStep(
      "verify",
      { skip_if: "capability >= verify-native" },
      ["verify-native"],
    );
    writeElisionLog(speqDir, "run-001", [decision]);

    const logPath = elisionLogPath(speqDir, "run-001");
    const parsed: ElisionDecision[] = JSON.parse(readFileSync(logPath, "utf-8"));
    expect(parsed[0].step).toBe("verify");
    expect(parsed[0].action).toBe("elided");
    expect(parsed[0].reason).toBe("capability verify-native");
    // Security gate still required
    expect(parsed[0].runSecurityGate).toBe(true);
  });

  it("does not log when step executes normally (no elision entry)", () => {
    const speqDir = join(TEST_DIR, ".speq");

    const decision = shouldElideStep(
      "verify",
      { skip_if: "capability >= verify-native" },
      [], // model lacks capability
    );
    expect(decision.action).toBe("executed");

    // Caller is responsible for not writing — but if called with empty array
    // the file should simply contain []
    writeElisionLog(speqDir, "run-002", []);
    const parsed = JSON.parse(readFileSync(elisionLogPath(speqDir, "run-002"), "utf-8"));
    expect(parsed).toEqual([]);
  });
});
