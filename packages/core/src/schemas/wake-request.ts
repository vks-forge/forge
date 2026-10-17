/**
 * Wake request schema — the durable "look at this ticket again" queue.
 *
 * Why: the Director must come back to a ticket after a retry delay, an answered question,
 *   a delegated child finishing or a monitor firing, and it must do so exactly once per
 *   cause even when the same trigger is delivered many times. A wake is therefore keyed
 *   by (ticket, reason, idempotency key): a duplicate bumps `coalesced_count` instead of
 *   queueing another run, and `created_at` makes the automated re-wake cap (at most three
 *   recovery wakes per ticket per hour) countable, so a rejected `done` run cannot be
 *   re-woken forever (director-core.md §3).
 *
 * Exports: WakeKind, WakeStatus, WakeRequest, NewWakeRequest.
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

/** Why the Director is waking a ticket (director-core.md §3 `wake_requests.kind`); `stage` starts the next stage of its pipeline. */
export const WakeKind = z.enum([
  'retry',
  'response_wake',
  'delegated',
  'monitor',
  'continuation',
  'stage',
]);
export type WakeKind = z.infer<typeof WakeKind>;

/** `pending` until a tick consumes it. */
export const WakeStatus = z.enum(['pending', 'consumed']);
export type WakeStatus = z.infer<typeof WakeStatus>;

const Timestamp = z.iso.datetime();

/** The `wake_requests` row. */
export const WakeRequest = z.object({
  id: z.string().min(1),
  ticket_id: z.string().min(1),
  reason: z.string().min(1),
  kind: WakeKind,
  idempotency_key: z.string().min(1),
  coalesced_count: z.number().int().nonnegative(),
  status: WakeStatus,
  not_before: Timestamp.optional(),
  created_at: Timestamp,
  consumed_at: Timestamp.optional(),
});
export type WakeRequest = z.infer<typeof WakeRequest>;

/** A wake as the caller submits it; storage sets the count, status and consumption time. */
export const NewWakeRequest = WakeRequest.omit({
  coalesced_count: true,
  status: true,
  consumed_at: true,
});
export type NewWakeRequest = z.infer<typeof NewWakeRequest>;
