/**
 * Run inbox schema — messages waiting to be delivered into a live run.
 *
 * Why: a human or the Director steers a running Worker (steer, follow-up, interrupt)
 *   while the run is busy or between turns, and the message must not be lost if the
 *   driver is not ready or the server restarts. The inbox row is the durable queue:
 *   written once, numbered per run by storage, and marked delivered when a driver has
 *   actually handed it to the harness, which is also what the `inbox_delivered` run event
 *   points at (director-core.md §8).
 *
 * Exports: RunInboxMessage, NewRunInboxMessage.
 * Depends on: schemas/run, zod. No IO.
 */

import { z } from 'zod';
import { SteerMode } from '#/schemas/run.js';

/** The `run_inbox` row. `seq` is 0-based and allocated by storage, like run event `seq`. */
export const RunInboxMessage = z.object({
  run_id: z.string().min(1),
  seq: z.number().int().nonnegative(),
  mode: SteerMode,
  author: z.string().min(1),
  text: z.string().min(1),
  delivered_at: z.iso.datetime().optional(),
});
export type RunInboxMessage = z.infer<typeof RunInboxMessage>;

/** A message as the sender submits it: no `seq`, not yet delivered. */
export const NewRunInboxMessage = RunInboxMessage.omit({
  seq: true,
  delivered_at: true,
});
export type NewRunInboxMessage = z.infer<typeof NewRunInboxMessage>;
