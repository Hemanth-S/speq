import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { loadConfig } from "./pipeline-config.js";
import type { RunSummary } from "./telemetry.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BoardStep {
  name: string;
  status: "pending" | "active" | "complete";
}

export interface BoardIssue {
  id: string;
  title: string;
  status: string;
  complexity?: string;
}

export interface BoardConfigRow {
  step: string;
  model: string;
  prompt_version: string;
  impl?: string;
}

export interface BoardCost {
  tokens_in: number;
  tokens_out: number;
  estimated_cost_usd: number;
  wall_clock_ms: number;
}

export interface BoardRunHistoryEntry {
  run_id: string;
  timestamp: string;
  status: string;
  cost_usd: number;
}

export interface BoardData {
  currentStep?: string;
  steps: BoardStep[];
  issues: BoardIssue[];
  config: BoardConfigRow[];
  cost?: BoardCost;
  runHistory: BoardRunHistoryEntry[];
}

// ---------------------------------------------------------------------------
// Pipeline step order
// ---------------------------------------------------------------------------

const PIPELINE_STEPS = ["enrich", "spec", "plan", "implement", "verify", "done"] as const;

// ---------------------------------------------------------------------------
// gatherBoardData
// ---------------------------------------------------------------------------

/**
 * Gather board data from project state.
 * - Reads speq.config.yaml via loadConfig
 * - Reads .speq/runs/ for cost data and run history
 * - Tries `bd list` via spawnSync — if it fails, returns empty issues array
 * - Detects current step from latest run's step records
 *
 * SECURITY: Never reads or emits env var values or file contents.
 */
export function gatherBoardData(projectDir: string): BoardData {
  // --- Config (model names and prompt versions only, no secret values) ---
  const pipelineConfig = loadConfig(projectDir);
  const config: BoardConfigRow[] = Object.entries(pipelineConfig.steps).map(([step, sc]) => ({
    step,
    model: sc.model,
    prompt_version: sc.prompt_version,
    ...(sc.impl ? { impl: sc.impl } : {}),
  }));

  // --- Run history + cost data ---
  const runsDir = join(projectDir, ".speq", "runs");
  const runHistory: BoardRunHistoryEntry[] = [];
  let cost: BoardCost | undefined;
  let latestRunId: string | undefined;

  if (existsSync(runsDir)) {
    let runDirs: string[];
    try {
      runDirs = readdirSync(runsDir)
        .filter((name) => name.startsWith("run-"))
        .sort(); // lexicographic sort = chronological for run-YYYYMMDD-HHMMSS
    } catch {
      runDirs = [];
    }

    for (const runId of runDirs) {
      const runDir = join(runsDir, runId);
      const summaryPath = join(runDir, "summary.json");

      // Track the latest run dir regardless of whether summary.json exists
      latestRunId = runId;

      if (!existsSync(summaryPath)) continue;

      try {
        const raw = readFileSync(summaryPath, "utf-8");
        const summary = JSON.parse(raw) as RunSummary;

        // Derive a human-readable timestamp from the run_id (run-YYYYMMDD-HHMMSS)
        const timestamp = deriveTimestamp(runId);

        runHistory.push({
          run_id: summary.run_id,
          timestamp,
          status: summary.status,
          cost_usd: summary.estimated_cost_usd,
        });

        // Use latest run for the cost panel
        cost = {
          tokens_in: summary.total_tokens_in,
          tokens_out: summary.total_tokens_out,
          estimated_cost_usd: summary.estimated_cost_usd,
          wall_clock_ms: summary.total_wall_clock_ms,
        };
      } catch {
        // Skip unreadable summaries
      }
    }
  }

  // --- Detect current step from latest run's step records ---
  const completedStepNames = new Set<string>();

  if (latestRunId && existsSync(runsDir)) {
    const runDir = join(runsDir, latestRunId);
    try {
      const files = readdirSync(runDir).filter(
        (f) => f.endsWith(".json") && f !== "summary.json",
      );
      for (const file of files) {
        const stepName = file.replace(/\.json$/, "");
        if ((PIPELINE_STEPS as readonly string[]).includes(stepName)) {
          completedStepNames.add(stepName);
        }
      }
    } catch {
      // Ignore
    }
  }

  // Determine step statuses
  const steps: BoardStep[] = buildStepStatuses(completedStepNames);
  const currentStep = steps.find((s) => s.status === "active")?.name;

  // --- Beads issues ---
  const issues = fetchBeadsIssues(projectDir);

  return {
    currentStep,
    steps,
    issues,
    config,
    cost,
    runHistory,
  };
}

// ---------------------------------------------------------------------------
// renderBoard
// ---------------------------------------------------------------------------

/**
 * Render board data as a self-contained HTML string.
 * All CSS is inlined. No external resource URLs.
 * No env var values or secrets are emitted.
 */
export function renderBoard(data: BoardData): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>speq Sprint Board</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; background: #0f1117; color: #e0e0e0; padding: 24px; }
  h1 { font-size: 1.5rem; margin-bottom: 24px; color: #fff; }
  h2 { font-size: 1.1rem; margin-bottom: 12px; color: #aaa; text-transform: uppercase; letter-spacing: 0.05em; }
  section { margin-bottom: 32px; }

  /* Pipeline lanes */
  .pipeline { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; }
  .lane { flex: 1; min-width: 100px; padding: 12px 8px; border-radius: 6px; text-align: center; font-size: 0.85rem; font-weight: 600; text-transform: capitalize; border: 2px solid transparent; }
  .lane.pending  { background: #1e2029; color: #666; border-color: #2a2d3a; }
  .lane.complete { background: #0d2b1a; color: #4caf7d; border-color: #1f6b3a; }
  .lane.active   { background: #1a2a4a; color: #60a5fa; border-color: #3b82f6; box-shadow: 0 0 12px rgba(59,130,246,0.3); }

  /* Issue cards */
  .issue-list { display: flex; flex-direction: column; gap: 8px; }
  .issue-card { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: #1a1d24; border-radius: 6px; border-left: 3px solid #333; }
  .issue-card.open       { border-left-color: #60a5fa; }
  .issue-card.in-progress{ border-left-color: #f59e0b; }
  .issue-card.closed     { border-left-color: #4caf7d; opacity: 0.7; }
  .issue-id    { font-size: 0.75rem; color: #888; min-width: 60px; font-family: monospace; }
  .issue-title { flex: 1; font-size: 0.9rem; }
  .issue-status { font-size: 0.72rem; padding: 2px 8px; border-radius: 99px; background: #2a2d3a; color: #aaa; }
  .issue-complexity { font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; background: #2a3a2a; color: #7dba8a; font-weight: 700; }
  .beads-unavailable { color: #888; font-style: italic; padding: 12px 0; }

  /* Config table */
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #2a2d3a; }
  th { color: #888; font-weight: 600; text-transform: uppercase; font-size: 0.72rem; letter-spacing: 0.05em; }
  td { color: #e0e0e0; }
  td:first-child { text-transform: capitalize; }
  tr:last-child td { border-bottom: none; }

  /* Cost panel */
  .cost-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
  .cost-card { background: #1a1d24; border-radius: 6px; padding: 14px; }
  .cost-label { font-size: 0.72rem; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
  .cost-value { font-size: 1.2rem; font-weight: 700; color: #fff; }

  /* Run history */
  .run-row { display: flex; gap: 12px; padding: 8px 12px; background: #1a1d24; border-radius: 6px; margin-bottom: 6px; font-size: 0.82rem; align-items: center; }
  .run-id { font-family: monospace; color: #aaa; flex: 1; }
  .run-ts { color: #666; }
  .run-status.pass   { color: #4caf7d; }
  .run-status.failed { color: #f87171; }
  .run-cost { color: #f59e0b; font-weight: 600; }
</style>
</head>
<body>
<h1>speq Sprint Board</h1>

<section id="pipeline">
  <h2>Pipeline</h2>
  <div class="pipeline">
    ${data.steps.map(renderLane).join("\n    ")}
  </div>
</section>

<section id="issues">
  <h2>Beads Issues</h2>
  ${renderIssues(data.issues)}
</section>

<section id="configuration">
  <h2>Configuration</h2>
  ${renderConfig(data.config)}
</section>

<section id="cost">
  <h2>Cost</h2>
  ${renderCost(data.cost)}
</section>

<section id="run-history">
  <h2>Run History</h2>
  ${renderRunHistory(data.runHistory)}
</section>

</body>
</html>`;
}

// ---------------------------------------------------------------------------
// writeBoard
// ---------------------------------------------------------------------------

/**
 * Gather board data and write the rendered HTML to .speq/board.html.
 */
export function writeBoard(projectDir: string): void {
  const speqDir = join(projectDir, ".speq");
  mkdirSync(speqDir, { recursive: true });

  const data = gatherBoardData(projectDir);
  const html = renderBoard(data);

  writeFileSync(join(speqDir, "board.html"), html, "utf-8");
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function buildStepStatuses(completedNames: Set<string>): BoardStep[] {
  const steps: BoardStep[] = PIPELINE_STEPS.map((name) => ({
    name,
    status: "pending" as const,
  }));

  // Walk in order: steps before the first incomplete one are complete;
  // the first incomplete one that follows completed steps is active.
  let foundActive = false;
  for (const step of steps) {
    if (completedNames.has(step.name)) {
      step.status = "complete";
    } else if (!foundActive) {
      step.status = "active";
      foundActive = true;
    }
    // else: remains "pending"
  }

  return steps;
}

function fetchBeadsIssues(projectDir: string): BoardIssue[] {
  try {
    const result = spawnSync("bd", ["list", "--format", "json"], {
      cwd: projectDir,
      encoding: "buffer",
      timeout: 10_000,
    });

    if (result.error || result.status !== 0 || !result.stdout) {
      return [];
    }

    const raw = result.stdout.toString("utf-8").trim();
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .map((item) => ({
        id: String(item["id"] ?? ""),
        title: String(item["title"] ?? ""),
        status: String(item["status"] ?? ""),
        ...(item["complexity"] != null ? { complexity: String(item["complexity"]) } : {}),
      }));
  } catch {
    return [];
  }
}

function deriveTimestamp(runId: string): string {
  // run-YYYYMMDD-HHMMSS -> ISO string
  const match = /^run-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(runId);
  if (!match) return runId;
  const [, year, month, day, hour, min, sec] = match;
  return `${year}-${month}-${day}T${hour}:${min}:${sec}Z`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderLane(step: BoardStep): string {
  return `<div class="lane ${step.status}" data-step="${escapeHtml(step.name)}">${escapeHtml(step.name)}</div>`;
}

function renderIssues(issues: BoardIssue[]): string {
  if (issues.length === 0) {
    return `<p class="beads-unavailable">Beads unavailable — no issues to display.</p>`;
  }

  const cards = issues
    .map((issue) => {
      const statusClass = escapeHtml(issue.status.replace(/\s+/g, "-").toLowerCase());
      const complexityBadge = issue.complexity
        ? `<span class="issue-complexity">${escapeHtml(issue.complexity)}</span>`
        : "";
      return `<div class="issue-card ${statusClass}">
      <span class="issue-id">${escapeHtml(issue.id)}</span>
      <span class="issue-title">${escapeHtml(issue.title)}</span>
      <span class="issue-status">${escapeHtml(issue.status)}</span>
      ${complexityBadge}
    </div>`;
    })
    .join("\n    ");

  return `<div class="issue-list">\n    ${cards}\n  </div>`;
}

function renderConfig(rows: BoardConfigRow[]): string {
  if (rows.length === 0) {
    return `<p style="color:#666">No configuration found.</p>`;
  }

  const rowsHtml = rows
    .map(
      (row) => `<tr>
      <td>${escapeHtml(row.step)}</td>
      <td>${escapeHtml(row.model)}</td>
      <td>${escapeHtml(row.prompt_version)}</td>
      <td>${row.impl ? escapeHtml(row.impl) : "<span style=\"color:#555\">—</span>"}</td>
    </tr>`,
    )
    .join("\n    ");

  return `<table>
  <thead>
    <tr><th>Step</th><th>Model</th><th>Prompt Version</th><th>Implementation</th></tr>
  </thead>
  <tbody>
    ${rowsHtml}
  </tbody>
</table>`;
}

function renderCost(cost: BoardCost | undefined): string {
  if (!cost) {
    return `<p style="color:#666">No run data available.</p>`;
  }

  return `<div class="cost-grid">
  <div class="cost-card">
    <div class="cost-label">Tokens In</div>
    <div class="cost-value">${cost.tokens_in}</div>
  </div>
  <div class="cost-card">
    <div class="cost-label">Tokens Out</div>
    <div class="cost-value">${cost.tokens_out}</div>
  </div>
  <div class="cost-card">
    <div class="cost-label">Estimated Cost</div>
    <div class="cost-value">$${cost.estimated_cost_usd}</div>
  </div>
  <div class="cost-card">
    <div class="cost-label">Wall Clock</div>
    <div class="cost-value">${(cost.wall_clock_ms / 1000).toFixed(1)}s</div>
  </div>
</div>`;
}

function renderRunHistory(history: BoardRunHistoryEntry[]): string {
  if (history.length === 0) {
    return `<p style="color:#666">No previous runs found.</p>`;
  }

  const rows = history
    .map(
      (run) => `<div class="run-row">
    <span class="run-id">${escapeHtml(run.run_id)}</span>
    <span class="run-ts">${escapeHtml(run.timestamp)}</span>
    <span class="run-status ${escapeHtml(run.status)}">${escapeHtml(run.status)}</span>
    <span class="run-cost">$${run.cost_usd.toFixed(4)}</span>
  </div>`,
    )
    .join("\n  ");

  return rows;
}
