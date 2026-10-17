/**
 * Usage and session reference schemas.
 *
 * Why: token spend and the harness session id appear in run results, run rows and the event
 *   stream. Defining them once, below both the run and the run-event schemas, lets those two
 *   share them without importing each other.
 *
 * Exports: Usage, UsageReport, SessionRef (and their types).
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

/** Token counts for one model. */
export const Usage = z.object({
  in: z.number().nonnegative(),
  out: z.number().nonnegative(),
  cachedIn: z.number().nonnegative(),
  cacheWrite: z.number().nonnegative(),
});
export type Usage = z.infer<typeof Usage>;

/** Total usage with an optional per-model breakdown. */
export const UsageReport = Usage.extend({
  byModel: z.record(z.string(), Usage).optional(),
});
export type UsageReport = z.infer<typeof UsageReport>;

/** Opaque harness session id used to resume a run. */
export const SessionRef = z.string().min(1);
export type SessionRef = z.infer<typeof SessionRef>;
