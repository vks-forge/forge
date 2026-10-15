/**
 * CardEvent schemas — the append-only history of a card.
 *
 * Why: a card is the record of an intake, so everything that happens to it must be readable
 *   in order on the Card page: what the user and the Director said, which tickets the
 *   triage made, how each moved, which questions opened and were answered, and who changed
 *   the type or closed it (d-0105, d-0112 logs every action with its actor). One closed
 *   union keyed by `kind`, each kind with its own payload, means the UI renders every entry
 *   without guessing and a writer cannot store a `ticket_state` event without the ticket it
 *   is about. `seq` is allocated by storage alone, as for run events, so two writers cannot
 *   collide and a page boundary is a stable cursor.
 *
 * Exports: CARD_EVENT_KINDS, CardEventKind, NewCardEvent, CardEvent.
 * Depends on: schemas/card, schemas/ids, schemas/ticket, zod. No IO.
 */

import { z } from 'zod';
import { CardActor, CardTypeName } from '#/schemas/card.js';
import { CardId } from '#/schemas/ids.js';
import { TicketStatus } from '#/schemas/ticket.js';

export const CARD_EVENT_KINDS = [
  'user_message',
  'director_message',
  'ticket_created',
  'ticket_state',
  'interaction_opened',
  'interaction_answered',
  'type_changed',
  'card_closed',
  'note',
] as const;
export const CardEventKind = z.enum(CARD_EVENT_KINDS);
export type CardEventKind = z.infer<typeof CardEventKind>;

const event = <K extends CardEventKind, P extends z.ZodType>(kind: K, payload: P) =>
  z.object({
    kind: z.literal(kind),
    at: z.iso.datetime(),
    actor: CardActor,
    payload,
  });

const text = z.object({ text: z.string().min(1) });
const ticket = z.object({ ticket_id: z.string().min(1) });

/** A card event before storage has numbered it. */
export const NewCardEvent = z.discriminatedUnion('kind', [
  event('user_message', text),
  event('director_message', text),
  event('ticket_created', ticket.extend({ title: z.string().min(1) })),
  event(
    'ticket_state',
    ticket.extend({
      from: TicketStatus,
      to: TicketStatus,
      reason: z.string().optional(),
    }),
  ),
  event(
    'interaction_opened',
    ticket.extend({ interaction_id: z.string().min(1), interaction_kind: z.string() }),
  ),
  event('interaction_answered', ticket.extend({ interaction_id: z.string().min(1) })),
  event('type_changed', z.object({ from: CardTypeName, to: CardTypeName })),
  event('card_closed', z.object({ reason: z.string().min(1) })),
  event('note', text),
]);
export type NewCardEvent = z.infer<typeof NewCardEvent>;

/** A stored card event: the card it belongs to and its 0-based position in that card's history. */
export const CardEvent = z.intersection(
  NewCardEvent,
  z.object({ card_id: CardId, seq: z.number().int().nonnegative() }),
);
export type CardEvent = z.infer<typeof CardEvent>;
