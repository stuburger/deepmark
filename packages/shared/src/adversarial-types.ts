/**
 * Result of one iteration in the adversarial mark-scheme refinement loop.
 * Caller persists these as MarkSchemeTestRun records.
 */
export interface TestRunResult {
  iteration: number;
  targetScore: number;
  actualScore: number;
  delta: number;
  studentAnswer: string;
  graderReasoning: string;
  schemaPatch?: string;
  converged: boolean;
}

/**
 * Options for the adversarial loop. Target scores are probed in order;
 * the loop runs until convergence or maxIterations per target.
 */
export interface AdversarialLoopOptions {
  /** Score boundaries to probe (e.g. [1, 5, 10, 15, 20] for a 20-point question). */
  targetScores: number[];
  /** Max iterations per target score before moving on. */
  maxIterations?: number;
}
