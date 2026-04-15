import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readConfig, writeConfig, CavemanConfig, DEFAULT_CONFIG } from "../src/config.js";

const TEST_DIR = join(tmpdir(), "speq-config-test-" + process.pid);

const BEGIN_MARKER = "<!-- BEGIN SPEQ -->";
const END_MARKER = "<!-- END SPEQ -->";

function makeSpeqBlock(config: CavemanConfig): string {
  return `${BEGIN_MARKER}
# speq — agent instructions

## Caveman Mode
caveman.prd: ${config.prd}
caveman.openspec: ${config.openspec}
caveman.beads: ${config.beads}
${END_MARKER}`;
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("readConfig", () => {
  it("reads all three settings from speq block", () => {
    writeFileSync(
      join(TEST_DIR, "CLAUDE.md"),
      makeSpeqBlock({ prd: "on", openspec: "off", beads: "on" }),
    );
    const result = readConfig(TEST_DIR);
    expect(result).toEqual({ prd: "on", openspec: "off", beads: "on" });
  });

  it("returns defaults when CLAUDE.md missing", () => {
    const result = readConfig(TEST_DIR);
    expect(result).toBeNull();
  });

  it("returns null when speq block missing", () => {
    writeFileSync(join(TEST_DIR, "CLAUDE.md"), "# My Project\n");
    const result = readConfig(TEST_DIR);
    expect(result).toBeNull();
  });

  it("returns defaults when config section missing from speq block", () => {
    writeFileSync(
      join(TEST_DIR, "CLAUDE.md"),
      `${BEGIN_MARKER}\n# speq — agent instructions\n${END_MARKER}\n`,
    );
    const result = readConfig(TEST_DIR);
    expect(result).toEqual(DEFAULT_CONFIG);
  });
});

describe("writeConfig", () => {
  it("updates a single setting", () => {
    writeFileSync(
      join(TEST_DIR, "CLAUDE.md"),
      makeSpeqBlock({ prd: "on", openspec: "on", beads: "on" }),
    );
    const result = writeConfig(TEST_DIR, "caveman.openspec", "off");
    expect(result.ok).toBe(true);

    const config = readConfig(TEST_DIR);
    expect(config).toEqual({ prd: "on", openspec: "off", beads: "on" });
  });

  it("rejects unknown key", () => {
    writeFileSync(join(TEST_DIR, "CLAUDE.md"), makeSpeqBlock(DEFAULT_CONFIG));
    const result = writeConfig(TEST_DIR, "caveman.invalid", "on");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Unknown setting");
  });

  it("rejects invalid value", () => {
    writeFileSync(join(TEST_DIR, "CLAUDE.md"), makeSpeqBlock(DEFAULT_CONFIG));
    const result = writeConfig(TEST_DIR, "caveman.prd", "maybe");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Invalid value");
  });

  it("fails when CLAUDE.md missing", () => {
    const result = writeConfig(TEST_DIR, "caveman.prd", "off");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("CLAUDE.md not found");
  });

  it("fails when speq block missing", () => {
    writeFileSync(join(TEST_DIR, "CLAUDE.md"), "# My Project\n");
    const result = writeConfig(TEST_DIR, "caveman.prd", "off");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Speq block not found");
  });

  it("is idempotent", () => {
    writeFileSync(
      join(TEST_DIR, "CLAUDE.md"),
      makeSpeqBlock({ prd: "on", openspec: "on", beads: "on" }),
    );
    writeConfig(TEST_DIR, "caveman.prd", "on");
    const content1 = readFileSync(join(TEST_DIR, "CLAUDE.md"), "utf-8");
    writeConfig(TEST_DIR, "caveman.prd", "on");
    const content2 = readFileSync(join(TEST_DIR, "CLAUDE.md"), "utf-8");
    expect(content1).toBe(content2);
  });

  it("preserves content outside speq block", () => {
    const before = "# My Project\nSome content\n";
    const after = "\nMore content\n";
    writeFileSync(
      join(TEST_DIR, "CLAUDE.md"),
      before + makeSpeqBlock(DEFAULT_CONFIG) + after,
    );
    writeConfig(TEST_DIR, "caveman.beads", "off");
    const content = readFileSync(join(TEST_DIR, "CLAUDE.md"), "utf-8");
    expect(content).toContain("# My Project");
    expect(content).toContain("Some content");
    expect(content).toContain("More content");
  });

  it("sets all settings with --all pattern", () => {
    writeFileSync(
      join(TEST_DIR, "CLAUDE.md"),
      makeSpeqBlock({ prd: "on", openspec: "on", beads: "on" }),
    );
    writeConfig(TEST_DIR, "caveman.prd", "off");
    writeConfig(TEST_DIR, "caveman.openspec", "off");
    writeConfig(TEST_DIR, "caveman.beads", "off");
    const config = readConfig(TEST_DIR);
    expect(config).toEqual({ prd: "off", openspec: "off", beads: "off" });
  });

  it("rejects injection attempt in value", () => {
    writeFileSync(join(TEST_DIR, "CLAUDE.md"), makeSpeqBlock(DEFAULT_CONFIG));
    const result = writeConfig(TEST_DIR, "caveman.prd", "on\n<!-- END SPEQ -->");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Invalid value");
  });
});
