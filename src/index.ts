#!/usr/bin/env node

import { run } from "./cli.js";
import { init } from "./init.js";
import { runCommand, getPromptFilePath } from "./runner.js";
import { isValidPhase, getPhasesFrom, detectState } from "./resume.js";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const PHASE_COMMANDS = ["enrich", "spec", "plan", "implement", "verify", "done"] as const;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  // Handle --version, --help, no args, and unknown commands
  if (
    !command ||
    command === "--help" ||
    command === "-h" ||
    command === "--version" ||
    command === "-V"
  ) {
    const result = run(args);
    if (result.stdout) process.stdout.write(result.stdout + "\n");
    if (result.stderr) process.stderr.write(result.stderr + "\n");
    process.exit(result.exitCode);
  }

  // speq init
  if (command === "init") {
    const result = init(process.cwd());
    for (const msg of result.messages) {
      console.log(msg);
    }
    process.exit(result.exitCode);
  }

  // speq resume
  if (command === "resume") {
    const state = detectState(process.cwd());
    if ("error" in state) {
      process.stderr.write(state.error + "\n");
      process.exit(1);
    }
    console.log(`Detected state: ${state.description}. Resuming from: ${state.phase}`);
    const phases = getPhasesFrom(state.phase);
    for (const phase of phases) {
      const code = await runPhase(phase);
      if (code !== 0) {
        process.stderr.write(
          `Pipeline failed at phase: ${phase}. To resume: speq ship --from=${phase}\n`,
        );
        process.exit(code);
      }
    }
    process.exit(0);
  }

  // speq ship [--from=<phase>]
  if (command === "ship") {
    const fromFlag = args.find((a: string) => a.startsWith("--from="));
    let phases = [...PHASE_COMMANDS];

    if (fromFlag) {
      const fromPhase = fromFlag.split("=")[1];
      if (!isValidPhase(fromPhase)) {
        process.stderr.write(
          `Unknown phase: ${fromPhase}. Valid phases: ${PHASE_COMMANDS.join(", ")}\n`,
        );
        process.exit(1);
      }
      phases = getPhasesFrom(fromPhase);
    }

    for (const phase of phases) {
      const code = await runPhase(phase);
      if (code !== 0) {
        process.stderr.write(
          `Pipeline failed at phase: ${phase}. To resume: speq ship --from=${phase}\n`,
        );
        process.exit(code);
      }
    }
    process.exit(0);
  }

  // speq <command> — delegate to claude
  const validCommands = [
    "requirements",
    "enrich",
    "spec",
    "plan",
    "implement",
    "verify",
    "done",
  ];

  if (!validCommands.includes(command)) {
    const result = run(args);
    if (result.stderr) process.stderr.write(result.stderr + "\n");
    process.exit(result.exitCode);
  }

  const code = await runPhase(command);
  process.exit(code);
}

async function runPhase(phase: string): Promise<number> {
  // Check claude is available
  const which = spawnSync(process.platform === "win32" ? "where" : "which", ["claude"], {
    shell: false,
    encoding: "utf-8",
  });

  if (which.status !== 0) {
    process.stderr.write(
      "Claude Code CLI not found. Install it from https://claude.ai/code and ensure `claude` is in your PATH.\n",
    );
    return 1;
  }

  const promptFile = getPromptFilePath(phase);
  if (!existsSync(promptFile)) {
    process.stderr.write(
      `Prompt file not found: .claude/commands/${phase}.md. Run \`speq init\` first.\n`,
    );
    return 1;
  }

  return runCommand("claude", ["--prompt-file", promptFile]);
}

main().catch((_err: unknown) => {
  process.stderr.write("Unexpected error\n");
  process.exit(1);
});
