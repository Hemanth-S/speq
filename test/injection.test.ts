import { describe, it, expect, vi, beforeEach } from "vitest";
import { runCommand, lastSpawnCall, getPromptFilePath } from "../src/runner.js";
import * as child_process from "node:child_process";

// Mock spawn to avoid actually executing anything
vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => {
    const emitter = {
      on: vi.fn((event: string, cb: (code: number) => void) => {
        if (event === "close") setTimeout(() => cb(0), 0);
        return emitter;
      }),
    };
    return emitter;
  }),
}));

describe("Command Injection Prevention [P0]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses spawn with shell: false for paths with shell metacharacters", async () => {
    const maliciousPath = "/tmp/; rm -rf /;/commands/ship.md";

    await runCommand("claude", ["--prompt-file", maliciousPath]);

    const spawnMock = vi.mocked(child_process.spawn);
    expect(spawnMock).toHaveBeenCalledWith(
      "claude",
      ["--prompt-file", maliciousPath],
      expect.objectContaining({ shell: false }),
    );
  });

  it("passes path with $(whoami) as literal string", async () => {
    const injectionPath = "/tmp/$(whoami)/commands/ship.md";

    await runCommand("claude", ["--prompt-file", injectionPath]);

    expect(lastSpawnCall).toEqual({
      command: "claude",
      args: ["--prompt-file", injectionPath],
    });

    const spawnMock = vi.mocked(child_process.spawn);
    expect(spawnMock).toHaveBeenCalledWith(
      "claude",
      ["--prompt-file", injectionPath],
      expect.objectContaining({ shell: false }),
    );
  });

  it("getPromptFilePath does not evaluate shell expressions in cwd", () => {
    const path = getPromptFilePath("ship");
    // Must contain literal .claude/commands/ship.md — no shell evaluation
    expect(path).toContain(".claude");
    expect(path).toContain("commands");
    expect(path).toContain("ship.md");
  });
});
