/**
 * HarnessState schema — a harness parked until its quota resets.
 *
 * Why: a coding harness runs on the user's own subscription, which has a usage window.
 *   When a run reports that the account has no quota left, every other run on that harness
 *   would fail the same way, burn its retries and park for a human. The Director records the
 *   pause once, per harness, with the reset time and the reason in plain words, and
 *   dispatch skips that harness until the time passes (d-0097). The row survives a restart,
 *   so a server that comes back at noon does not hammer a harness that resets at two. It is
 *   kept apart from the `harnesses` registry because a pause is scheduling state that
 *   changes every few hours, while the registry is settings the owner edits.
 *
 * Exports: HarnessState.
 * Depends on: schemas/harness, zod. No IO.
 */

import { z } from 'zod';
import { HarnessId } from '#/schemas/harness.js';

const Timestamp = z.iso.datetime();

/** The `harness_state` table row: `harness_id` is paused while `paused_until` is in the future. */
export const HarnessState = z.object({
  harness_id: HarnessId,
  paused_until: Timestamp,
  /** Plain-language cause, shown next to the harness and in a ticket's wait reason. */
  reason: z.string().min(1),
  updated_at: Timestamp,
});
export type HarnessState = z.infer<typeof HarnessState>;
