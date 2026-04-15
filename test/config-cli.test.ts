import { describe, it, expect } from "vitest";
import { run } from "../src/cli.js";

describe("speq config CLI routing", () => {
  it("recognizes config as a valid command", () => {
    const result = run(["config"]);
    expect(result.exitCode).toBe(0);
  });

  it("shows config in help output", () => {
    const result = run(["--help"]);
    expect(result.stdout).toContain("config");
  });
});
