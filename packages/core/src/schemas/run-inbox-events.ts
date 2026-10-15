/**
 * Run events that belong to the run inbox: a message was shown, a message was delivered.
 *
 * Why: a person's message to a Worker (d-0109) must be visible in the run's live thread the
 *   moment it is sent, and the thread must also show whether the harness actually took it.
 *   `user_message` is written by the engine with the inbox row (who said what, in which
 *   mode); `inbox_delivered` is written by the driver once the harness accepted it. Both
 *   carry the inbox sequence number so a viewer pairs them and a message that was never
 *   delivered is visibly pending.
 *
 * Exports: UserMessageEvent, InboxDeliveredEvent.
 * Depends on: schemas/steer-mode, zod. No IO.
 */

import { z } from 'zod';
import { SteerMode } from '#/schemas/steer-mode.js';

const eventBase = { seq: z.number().int().nonnegative(), ts: z.iso.datetime() };

/** A person's (or the Director's) message to the Worker, stored before delivery. */
export const UserMessageEvent = z.object({
  type: z.literal('user_message'),
  ...eventBase,
  inbox_seq: z.number().int().nonnegative(),
  mode: SteerMode,
  author: z.string().min(1),
  text: z.string().min(1),
});

/** The driver handed inbox message `inbox_seq` to the harness. */
export const InboxDeliveredEvent = z.object({
  type: z.literal('inbox_delivered'),
  ...eventBase,
  inbox_seq: z.number().int().nonnegative(),
  mode: SteerMode,
});
