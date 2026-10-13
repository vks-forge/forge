/**
 * Shapes passed between the Claude DirectorLLM adapter's parts.
 *
 * Why: running the `claude -p` child, reading the document it printed and turning that into
 *   a typed step result are three separate jobs (process, parse, classify). These records are
 *   what one hands the next, so each job can be tested on its own with plain values and no
 *   child process.
 *
 * Exports: RawRun, StepOutput, StepContext.
 * Depends on: schemas/claude-acp, schemas/claude-stream-json. Types only.
 */

import type { RateLimitInfo } from '#/schemas/claude-acp.js';
import type { CliResultLine } from '#/schemas/claude-stream-json.js';

/** What the child process produced, before anyone reads it. */
export interface RawRun {
  readonly stdout: string;
  readonly tail: string;
  readonly exit: string;
  readonly failure?: 'timeout' | 'spawn';
  readonly detail?: string;
}

/** What was found in stdout: the final result (if any) and the last rate-limit report. */
export interface StepOutput {
  readonly result: CliResultLine | null;
  readonly rateLimit: RateLimitInfo | null;
}

/** Facts about the call that are not in the document. */
export interface StepContext {
  readonly nowMs: number;
  readonly backoffMs: number;
  /** Tail of stderr and stdout, for the message and for login/limit text with no document. */
  readonly tail: string;
  /** How the process ended, e.g. `code 1`; for the message only. */
  readonly exit?: string;
}
