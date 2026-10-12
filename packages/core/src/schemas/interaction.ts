/**
 * Interaction schema — blocking questions and approvals to a human.
 *
 * Why: a Worker or the Director can park a ticket until a human answers; the row
 *   records the question, its timeout and the answer (director-core.md §3
 *   `interactions`, §8 blocking questions).
 *
 * Exports: InteractionStatus, Interaction.
 * Depends on: schemas/run, zod. No IO.
 */

import { z } from 'zod';
import { InteractionKind } from './run.js';

/** Lifecycle of an interaction. */
/** The `interactions` row of director-core.md §3. */
export const InteractionStatus = z.enum([
  'pending',
  'answered',
  'timed_out',
  'cancelled',
]);
export type InteractionStatus = z.infer<typeof InteractionStatus>;

// director-core.md §3 `interactions` row.
export const Interaction = z.object({
  id: z.string().min(1),
  ticket_id: z.string().min(1),
  run_id: z.string().min(1).optional(),
  kind: InteractionKind,
  payload: z.unknown(),
  status: InteractionStatus,
  asked_at: z.iso.datetime(),
  answered_at: z.iso.datetime().optional(),
  timeout_at: z.iso.datetime(),
  answer: z.unknown().optional(),
});
export type Interaction = z.infer<typeof Interaction>;
