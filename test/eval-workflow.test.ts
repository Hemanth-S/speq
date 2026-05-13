import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  addFixture,
  runWorkflowEval,
  getDirSize,
} from "../src/eval-workflow.js";

// Each test gets a unique temp dir so tests can run in parallel safely.
function makeTmpDir(): string {
  const dir = join(tmpdir(), `speq-eval-test-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Build a minimal .speq dir structure inside a given root.
function makeSpeqDir(root: string): string {
  const speqDir = join(root, ".speq");
  mkdirSync(join(speqDir, "evals", "fixtures"), { recursive: true });
  mkdirSync(join(speqDir, "evals", "runs"), { recursive: true });
  return speqDir;
}

// Create a realistic source fixture directory.
function makeSourceFixture(
  dir: string,
  opts: {
    includeDotGit?: boolean;
    includeNodeModules?: boolean;
    includeDist?: boolean;
    envContent?: string;
    extraFiles?: Record<string, string>;
    bigFile?: boolean;
  } = {},
): void {
  mkdirSync(dir, { recursive: true });

  // Always add a real source file and a markdown file.
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "index.ts"), 'export const hello = "world";\n');
  writeFileSync(join(dir, "prd-test.md"), "# PRD\nSome requirements.\n");

  if (opts.includeDotGit) {
    mkdirSync(join(dir, ".git"), { recursive: true });
    writeFileSync(join(dir, ".git", "HEAD"), "ref: refs/heads/main\n");
  }

  if (opts.includeNodeModules) {
    mkdirSync(join(dir, "node_modules", "lodash"), { recursive: true });
    writeFileSync(
      join(dir, "node_modules", "lodash", "index.js"),
      'module.exports = {};\n',
    );
  }

  if (opts.includeDist) {
    mkdirSync(join(dir, "dist"), { recursive: true });
    writeFileSync(join(dir, "dist", "index.js"), '"use strict";\n');
  }

  if (opts.envContent !== undefined) {
    writeFileSync(join(dir, ".env"), opts.envContent);
  }

  if (opts.extraFiles) {
    for (const [relPath, content] of Object.entries(opts.extraFiles)) {
      const fullPath = join(dir, relPath);
      mkdirSync(join(fullPath, ".."), { recursive: true });
      writeFileSync(fullPath, content);
    }
  }

  if (opts.bigFile) {
    // Write a ~1.5 MB file to push the fixture over the 1 MB limit.
    writeFileSync(join(dir, "big.bin"), Buffer.alloc(1.5 * 1024 * 1024, 0x42));
  }
}

// ---------------------------------------------------------------------------
// getDirSize
// ---------------------------------------------------------------------------
describe("getDirSize", () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTmpDir(); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("returns 0 for an empty directory", () => {
    expect(getDirSize(tmp)).toBe(0);
  });

  it("sums sizes of all files recursively", () => {
    writeFileSync(join(tmp, "a.txt"), "hello"); // 5 bytes
    mkdirSync(join(tmp, "sub"));
    writeFileSync(join(tmp, "sub", "b.txt"), "world!"); // 6 bytes
    expect(getDirSize(tmp)).toBe(11);
  });
});

// ---------------------------------------------------------------------------
// addFixture — P1: Fixture added with exclusions
// ---------------------------------------------------------------------------
describe("addFixture — exclusions (.git, node_modules, dist stripped)", () => {
  let tmp: string;
  let speqDir: string;
  let sourceDir: string;

  beforeEach(() => {
    tmp = makeTmpDir();
    speqDir = makeSpeqDir(tmp);
    sourceDir = join(tmp, "test-fixture");
    makeSourceFixture(sourceDir, {
      includeDotGit: true,
      includeNodeModules: true,
      includeDist: true,
    });
  });

  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("returns ok:true and copies source excluding excluded dirs", () => {
    const result = addFixture(speqDir, sourceDir);
    expect(result.ok).toBe(true);
    expect(result.path).toBeDefined();
  });

  it("strips .git from the copied fixture", () => {
    addFixture(speqDir, sourceDir);
    const dest = join(speqDir, "evals", "fixtures", "test-fixture");
    expect(existsSync(join(dest, ".git"))).toBe(false);
  });

  it("strips node_modules from the copied fixture", () => {
    addFixture(speqDir, sourceDir);
    const dest = join(speqDir, "evals", "fixtures", "test-fixture");
    expect(existsSync(join(dest, "node_modules"))).toBe(false);
  });

  it("strips dist from the copied fixture", () => {
    addFixture(speqDir, sourceDir);
    const dest = join(speqDir, "evals", "fixtures", "test-fixture");
    expect(existsSync(join(dest, "dist"))).toBe(false);
  });

  it("preserves regular source files and markdown", () => {
    addFixture(speqDir, sourceDir);
    const dest = join(speqDir, "evals", "fixtures", "test-fixture");
    expect(existsSync(join(dest, "src", "index.ts"))).toBe(true);
    expect(existsSync(join(dest, "prd-test.md"))).toBe(true);
  });

  it("result path points to the fixture directory", () => {
    const result = addFixture(speqDir, sourceDir);
    expect(result.path).toBe(join(speqDir, "evals", "fixtures", "test-fixture"));
  });

  it("respects a custom name override", () => {
    const result = addFixture(speqDir, sourceDir, "my-custom-fixture");
    expect(result.ok).toBe(true);
    expect(result.path).toBe(
      join(speqDir, "evals", "fixtures", "my-custom-fixture"),
    );
    expect(existsSync(result.path!)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// addFixture — P0: Fixture with credentials rejected
// ---------------------------------------------------------------------------
describe("addFixture — credentials rejection (.env with API_KEY)", () => {
  let tmp: string;
  let speqDir: string;
  let sourceDir: string;

  beforeEach(() => {
    tmp = makeTmpDir();
    speqDir = makeSpeqDir(tmp);
    sourceDir = join(tmp, "cred-fixture");
    makeSourceFixture(sourceDir, { envContent: "API_KEY=sk-live-abc123\nDB_HOST=localhost\n" });
  });

  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("returns ok:false when .env contains API_KEY=", () => {
    const result = addFixture(speqDir, sourceDir);
    expect(result.ok).toBe(false);
  });

  it("includes a warning about credentials in the message", () => {
    const result = addFixture(speqDir, sourceDir);
    expect(result.message.toLowerCase()).toMatch(/credential|secret|api.?key|\.env/i);
  });

  it("does NOT copy the fixture directory when credentials detected", () => {
    addFixture(speqDir, sourceDir);
    const dest = join(speqDir, "evals", "fixtures", "cred-fixture");
    expect(existsSync(dest)).toBe(false);
  });

  it("rejects SECRET= pattern too", () => {
    writeFileSync(join(sourceDir, ".env"), "SECRET=super-secret\n");
    const result = addFixture(speqDir, sourceDir);
    expect(result.ok).toBe(false);
  });

  it("rejects TOKEN= pattern too", () => {
    writeFileSync(join(sourceDir, ".env"), "TOKEN=ghp_abc123\n");
    const result = addFixture(speqDir, sourceDir);
    expect(result.ok).toBe(false);
  });

  it("allows .env with only safe variables (no credential patterns)", () => {
    writeFileSync(join(sourceDir, ".env"), "NODE_ENV=test\nPORT=3000\n");
    const result = addFixture(speqDir, sourceDir);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// addFixture — P1: Oversized fixture rejected (>1 MB)
// ---------------------------------------------------------------------------
describe("addFixture — oversized fixture rejected", () => {
  let tmp: string;
  let speqDir: string;
  let sourceDir: string;

  beforeEach(() => {
    tmp = makeTmpDir();
    speqDir = makeSpeqDir(tmp);
    sourceDir = join(tmp, "large-fixture");
    makeSourceFixture(sourceDir, { bigFile: true });
  });

  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("returns ok:false for a fixture exceeding 1 MB after exclusions", () => {
    const result = addFixture(speqDir, sourceDir);
    expect(result.ok).toBe(false);
  });

  it("includes size information in the error message", () => {
    const result = addFixture(speqDir, sourceDir);
    expect(result.message).toMatch(/1\s*MB|limit|exceed/i);
  });

  it("does not copy the oversized fixture", () => {
    addFixture(speqDir, sourceDir);
    const dest = join(speqDir, "evals", "fixtures", "large-fixture");
    expect(existsSync(dest)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// addFixture — P1: Idempotent fixture add (replace, not duplicate)
// ---------------------------------------------------------------------------
describe("addFixture — idempotent (replace, not duplicate)", () => {
  let tmp: string;
  let speqDir: string;
  let sourceDir: string;

  beforeEach(() => {
    tmp = makeTmpDir();
    speqDir = makeSpeqDir(tmp);
    sourceDir = join(tmp, "idem-fixture");
    makeSourceFixture(sourceDir);
  });

  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("succeeds on first add", () => {
    const result = addFixture(speqDir, sourceDir);
    expect(result.ok).toBe(true);
  });

  it("succeeds on second add of the same source", () => {
    addFixture(speqDir, sourceDir);
    const result = addFixture(speqDir, sourceDir);
    expect(result.ok).toBe(true);
  });

  it("result is byte-identical on repeated add of unchanged source", () => {
    addFixture(speqDir, sourceDir);
    const dest = join(speqDir, "evals", "fixtures", "idem-fixture");
    const contentBefore = readFileSync(join(dest, "src", "index.ts"), "utf-8");

    addFixture(speqDir, sourceDir);
    const contentAfter = readFileSync(join(dest, "src", "index.ts"), "utf-8");

    expect(contentAfter).toBe(contentBefore);
  });

  it("only one fixture directory exists after two adds", () => {
    addFixture(speqDir, sourceDir);
    addFixture(speqDir, sourceDir);
    const fixturesDir = join(speqDir, "evals", "fixtures");
    const entries = readdirSync(fixturesDir);
    const matching = entries.filter((e) => e === "idem-fixture");
    expect(matching).toHaveLength(1);
  });

  it("replaces old content when source changes between adds", () => {
    addFixture(speqDir, sourceDir);

    // Mutate source.
    writeFileSync(join(sourceDir, "src", "index.ts"), 'export const hello = "updated";\n');
    addFixture(speqDir, sourceDir);

    const dest = join(speqDir, "evals", "fixtures", "idem-fixture");
    const content = readFileSync(join(dest, "src", "index.ts"), "utf-8");
    expect(content).toContain("updated");
  });
});

// ---------------------------------------------------------------------------
// runWorkflowEval — P1: Regression detected (diff vs golden)
// ---------------------------------------------------------------------------
describe("runWorkflowEval — regression detected", () => {
  let tmp: string;
  let speqDir: string;

  beforeEach(() => {
    tmp = makeTmpDir();
    speqDir = makeSpeqDir(tmp);

    // Fixture with golden output and a diverged current output.
    const fixtureDir = join(speqDir, "evals", "fixtures", "test-fixture");
    mkdirSync(join(fixtureDir, "golden"), { recursive: true });
    mkdirSync(join(fixtureDir, "current"), { recursive: true });

    writeFileSync(join(fixtureDir, "golden", "output.md"), "# Expected output\nLine A\n");
    writeFileSync(join(fixtureDir, "current", "output.md"), "# Expected output\nLine B\n");
  });

  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("returns a summary with a regression entry for the fixture", () => {
    const summary = runWorkflowEval(speqDir);
    const entry = summary.fixtures.find((f) => f.fixture === "test-fixture");
    expect(entry).toBeDefined();
    expect(entry!.status).toBe("regression");
  });

  it("includes a non-empty diff in the regression entry", () => {
    const summary = runWorkflowEval(speqDir);
    const entry = summary.fixtures.find((f) => f.fixture === "test-fixture");
    expect(entry!.diff).toBeTruthy();
  });

  it("includes a severity rating in the regression entry", () => {
    const summary = runWorkflowEval(speqDir);
    const entry = summary.fixtures.find((f) => f.fixture === "test-fixture");
    expect(["low", "medium", "high"]).toContain(entry!.severity);
  });
});

// ---------------------------------------------------------------------------
// runWorkflowEval — P2: Failing fixture does not block others
// ---------------------------------------------------------------------------
describe("runWorkflowEval — failing fixture does not block others", () => {
  let tmp: string;
  let speqDir: string;

  beforeEach(() => {
    tmp = makeTmpDir();
    speqDir = makeSpeqDir(tmp);

    // broken-fixture: no golden dir → will error / skip.
    const brokenDir = join(speqDir, "evals", "fixtures", "broken-fixture");
    mkdirSync(brokenDir, { recursive: true });
    // Intentionally no golden/ or current/ subdirectory.

    // good-fixture: has matching golden and current.
    const goodDir = join(speqDir, "evals", "fixtures", "good-fixture");
    mkdirSync(join(goodDir, "golden"), { recursive: true });
    mkdirSync(join(goodDir, "current"), { recursive: true });
    writeFileSync(join(goodDir, "golden", "output.md"), "# Same content\n");
    writeFileSync(join(goodDir, "current", "output.md"), "# Same content\n");
  });

  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("reports both fixtures in the summary", () => {
    const summary = runWorkflowEval(speqDir);
    const names = summary.fixtures.map((f) => f.fixture);
    expect(names).toContain("broken-fixture");
    expect(names).toContain("good-fixture");
  });

  it("broken-fixture has status error or regression, good-fixture has status pass", () => {
    const summary = runWorkflowEval(speqDir);
    const broken = summary.fixtures.find((f) => f.fixture === "broken-fixture");
    const good = summary.fixtures.find((f) => f.fixture === "good-fixture");
    expect(broken!.status).toMatch(/error|regression/);
    expect(good!.status).toBe("pass");
  });

  it("aggregate report includes pass and error counts", () => {
    const summary = runWorkflowEval(speqDir);
    expect(typeof summary.passed).toBe("number");
    expect(typeof summary.failed + typeof summary.errors).toBe("numbernumber");
    expect(summary.passed + summary.failed + summary.errors).toBe(
      summary.fixtures.length,
    );
  });
});

// ---------------------------------------------------------------------------
// runWorkflowEval — P1: Eval results written to .speq/evals/runs/<timestamp>/
// ---------------------------------------------------------------------------
describe("runWorkflowEval — results written to runs directory", () => {
  let tmp: string;
  let speqDir: string;

  beforeEach(() => {
    tmp = makeTmpDir();
    speqDir = makeSpeqDir(tmp);

    // One passing fixture.
    const fixtureDir = join(speqDir, "evals", "fixtures", "pass-fixture");
    mkdirSync(join(fixtureDir, "golden"), { recursive: true });
    mkdirSync(join(fixtureDir, "current"), { recursive: true });
    writeFileSync(join(fixtureDir, "golden", "output.md"), "# Good\n");
    writeFileSync(join(fixtureDir, "current", "output.md"), "# Good\n");
  });

  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("creates a timestamped run directory inside .speq/evals/runs/", () => {
    runWorkflowEval(speqDir);
    const runsDir = join(speqDir, "evals", "runs");
    const runs = readdirSync(runsDir);
    expect(runs.length).toBeGreaterThan(0);
  });

  it("writes a summary.json in the run directory", () => {
    runWorkflowEval(speqDir);
    const runsDir = join(speqDir, "evals", "runs");
    const runDir = readdirSync(runsDir)[0];
    expect(existsSync(join(runsDir, runDir, "summary.json"))).toBe(true);
  });

  it("summary.json contains timestamp, fixtures, passed, failed, errors", () => {
    runWorkflowEval(speqDir);
    const runsDir = join(speqDir, "evals", "runs");
    const runDir = readdirSync(runsDir)[0];
    const raw = readFileSync(join(runsDir, runDir, "summary.json"), "utf-8");
    const summary = JSON.parse(raw);
    expect(summary).toHaveProperty("timestamp");
    expect(summary).toHaveProperty("fixtures");
    expect(summary).toHaveProperty("passed");
    expect(summary).toHaveProperty("failed");
    expect(summary).toHaveProperty("errors");
  });

  it("writes one JSON file per fixture in the run directory", () => {
    runWorkflowEval(speqDir);
    const runsDir = join(speqDir, "evals", "runs");
    const runDir = readdirSync(runsDir)[0];
    expect(
      existsSync(join(runsDir, runDir, "pass-fixture.json")),
    ).toBe(true);
  });

  it("returns an EvalSummary with a non-empty timestamp string", () => {
    const summary = runWorkflowEval(speqDir);
    expect(typeof summary.timestamp).toBe("string");
    expect(summary.timestamp.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// runWorkflowEval — P1: Single fixture eval completes (function shape test)
// ---------------------------------------------------------------------------
describe("runWorkflowEval — single fixture eval function shape", () => {
  let tmp: string;
  let speqDir: string;

  beforeEach(() => {
    tmp = makeTmpDir();
    speqDir = makeSpeqDir(tmp);

    const fixtureDir = join(speqDir, "evals", "fixtures", "shape-fixture");
    mkdirSync(join(fixtureDir, "golden"), { recursive: true });
    mkdirSync(join(fixtureDir, "current"), { recursive: true });
    writeFileSync(join(fixtureDir, "golden", "output.md"), "# Output\n");
    writeFileSync(join(fixtureDir, "current", "output.md"), "# Output\n");
  });

  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("runWorkflowEval returns an EvalSummary synchronously", () => {
    const result = runWorkflowEval(speqDir);
    expect(result).toBeDefined();
    expect(Array.isArray(result.fixtures)).toBe(true);
    expect(typeof result.passed).toBe("number");
    expect(typeof result.failed).toBe("number");
    expect(typeof result.errors).toBe("number");
    expect(typeof result.timestamp).toBe("string");
  });

  it("EvalRunResult entries conform to the expected shape", () => {
    const summary = runWorkflowEval(speqDir);
    for (const entry of summary.fixtures) {
      expect(typeof entry.fixture).toBe("string");
      expect(["pass", "regression", "error"]).toContain(entry.status);
    }
  });

  it("passing fixture increments the passed counter", () => {
    const summary = runWorkflowEval(speqDir);
    expect(summary.passed).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.errors).toBe(0);
  });
});
