/**
 * NeedsYouItem — one thing that waits on the owner, as the Card and Ticket pages read it.
 *
 * Why: the dock above the composer shows one item at a time (d-0172) whatever the number of
 *   waits, and it must not depend on which slice of history the browser loaded or on parsing
 *   a joined sentence. The server computes the current items (a Director raise, a ticket
 *   escalation, finished work waiting for review) and sends them in one shape: a kind named
 *   from the real cause, a short title, the separate reasons, and the actions the owner may
 *   take, so the screen draws them without guessing.
 *
 * Exports: NeedsYouItem.
 * Depends on: schemas/card-event, schemas/escalation, schemas/ids, zod. No IO.
 */

import { z } from 'zod';
import {
  NEEDS_YOU_ACTIONS,
  NEEDS_YOU_TITLE_MAX,
  NeedsYouKind,
} from '#/schemas/card-event.js';
import { EscalationAction } from '#/schemas/escalation.js';
import { TicketId } from '#/schemas/ids.js';

export const NeedsYouItem = z.object({
  kind: NeedsYouKind,
  title: z.string().min(1).max(NEEDS_YOU_TITLE_MAX),
  /** The separate reasons or questions; at least one for a raise, possibly none for finished work. */
  items: z.array(z.string()),
  /** Card raises use the card actions; ticket waits use the escalation actions (`POST /interactions/:id/act`, `POST /tickets/:id/act`). */
  actions: z.array(z.union([z.enum(NEEDS_YOU_ACTIONS), EscalationAction])),
  raised_at: z.iso.datetime(),
  /** The card event this raise came from; null for items derived from a ticket. */
  seq: z.number().int().nonnegative().nullable(),
  ticket_id: TicketId.optional(),
  /** The escalation to act on, when the item is one. */
  interaction_id: z.string().min(1).optional(),
});
export type NeedsYouItem = z.infer<typeof NeedsYouItem>;
