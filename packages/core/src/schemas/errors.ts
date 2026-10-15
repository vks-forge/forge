/**
 * ErrorFamily schema — the failure classes that drive retry/stall/kill.
 *
 * Why: when a run fails, the Director must decide whether to retry later, kill, escalate
 *   to a human or give up, and that decision cannot depend on message text that differs
 *   per harness and version. Drivers map every harness failure onto this one closed
 *   enum, and rate-limit backoff, a single crash retry, no retry for a refusal and
 *   escalation after repeated identical failures all key off the family. One enum shared
 *   by thrown errors, RunResult and run events guarantees a family means the same thing
 *   everywhere it appears (execution-plane.md §8).
 *
 * Exports: ErrorFamily.
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

/** Failure classes that drive retry/stall/kill. `rate_limit` is a transient provider throttle (back off and retry); `quota` is an account usage window used up until a reset time (the whole harness waits, d-0097). `invalid_input` is a caller bug (bad arguments, rejected patch, constraint violation): never retried as-is.  Maps from execution-plane.md §3: process -> crash, policy -> policy_denied/refusal. */
export const ErrorFamily = z.enum([
  'auth',
  'rate_limit',
  'quota',
  'budget',
  'stall',
  'refusal',
  'crash',
  'policy_denied',
  'unknown',
  'invalid_input',
]);
export type ErrorFamily = z.infer<typeof ErrorFamily>;
