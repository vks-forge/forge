/**
 * CardReplyQueue schemas — the durable list of card events the Director still owes a reply to.
 *
 * Why: a card gets a Director turn when it is created and whenever the owner writes in its
 *   chat (d-0134). That debt used to live in engine memory, so a restart dropped it and the
 *   owner's message sat unanswered with nothing to show it. Each owed turn is one stored row
 *   naming the card event that caused it; the tick claims rows, answers, and completes them,
 *   and a claim that never completed (the process died mid-answer) goes stale and is taken
 *   again. Only new events are ever queued, so old cards are never auto-answered (d-0141).
 *
 * Exports: CARD_REPLY_REASONS, CardReplyReason, CardReplyQueueItem, NewCardReply.
 * Depends on: schemas/ids, zod. No IO.
 */

import { z } from 'zod';
import { CardId } from '#/schemas/ids.js';

export const CARD_REPLY_REASONS = ['card_created', 'user_message'] as const;
export const CardReplyReason = z.enum(CARD_REPLY_REASONS);
export type CardReplyReason = z.infer<typeof CardReplyReason>;

/** What the caller supplies: the card, the card event that needs an answer, why, and when. */
export const NewCardReply = z.object({
  card_id: CardId,
  /** The `seq` of the card event (the `user_message`) this turn answers. */
  event_id: z.number().int().nonnegative(),
  reason: CardReplyReason,
  enqueued_at: z.iso.datetime(),
});
export type NewCardReply = z.infer<typeof NewCardReply>;

/** A stored queue row. `claimed_at` set and `done_at` unset means a tick is answering it now. */
export const CardReplyQueueItem = NewCardReply.extend({
  id: z.number().int().positive(),
  claimed_at: z.iso.datetime().optional(),
  done_at: z.iso.datetime().optional(),
});
export type CardReplyQueueItem = z.infer<typeof CardReplyQueueItem>;
