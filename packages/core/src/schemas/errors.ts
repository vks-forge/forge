/**
 * ErrorFamily schema — the failure classes that drive retry/stall/kill.
 *
 * Why: retry, stall and kill decisions read the family, never the message (code.md rule 7, execution-plane.md §8 run lifecycle retry policy); one enum is shared by errors, run results and run events.
 *
 * Exports: ErrorFamily.
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

/** Failure classes that drive retry/stall/kill. Maps from execution-plane.md §3: process -> crash, policy -> policy_denied/refusal. */
export const ErrorFamily = z.enum([
  'auth',
  'rate_limit',
  'budget',
  'stall',
  'refusal',
  'crash',
  'policy_denied',
  'unknown',
]);
export type ErrorFamily = z.infer<typeof ErrorFamily>;
