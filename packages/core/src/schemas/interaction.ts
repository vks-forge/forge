/**
 * Interaction schema — blocking questions and approvals to a human.
 *
 * Why: a Worker sometimes needs a human (a question, a plan confirmation, a permission
 *   outside its allow-list), and a run must not sit silently stalled while it waits. The
 *   interaction row is the durable reason a ticket is parked in WaitingHuman: what was
 *   asked, when it times out, what the human answered. The Director's invariant that
 *   every open ticket has a live run, a durable reason to wait or a visible blocking
 *   status depends on it; without the row a parked ticket looks like a lost one and the
 *   control room's "Needs you" pane has nothing to show (director-core.md §3, §8).
 *
 * Exports: InteractionStatus, Interaction.
 * Depends on: schemas/run, zod. No IO.
 */

import { z } from 'zod';
import { InteractionKind } from './run.js';

/** Lifecycle of an interaction. */
export const InteractionStatus = z.enum([
  'pending',
  'answered',
  'timed_out',
  'cancelled',
]);
export type InteractionStatus = z.infer<typeof InteractionStatus>;

/** The `interactions` row of director-core.md §3. */
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
