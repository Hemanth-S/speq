export interface RunnerOpts {
  /** Absolute path to a prompt file, if applicable. */
  promptFile?: string;
  /** Additional CLI flags to forward to the runner binary. */
  extraArgs?: string[];
}

export interface RunnerResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * A Runner is responsible for executing a prompt against a specific AI CLI.
 * All spawn calls MUST use shell: false.
 */
export interface Runner {
  /** Identifier used in models.yaml runner field. */
  readonly name: string;

  /**
   * Returns true if this runner handles the given fully-resolved model snapshot ID.
   */
  supports(model: string): boolean;

  /**
   * Execute a prompt against the model.
   * @param prompt  - The prompt text (written to a temp file if needed).
   * @param model   - The fully-resolved snapshot model ID.
   * @param opts    - Additional options.
   */
  exec(prompt: string, model: string, opts: RunnerOpts): Promise<RunnerResult>;
}
