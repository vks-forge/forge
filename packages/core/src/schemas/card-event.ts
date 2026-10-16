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
 *   The card chat adds three entries: `director_message` carries the actions the Director took
 *   with its reply, `director_action` logs each executed action, and `close_suggested`
 *   records a suggestion to close that only the user can act on (d-0112). `budget_warning`
 *   records that spend crossed a fraction of the card's cap, once per threshold; it only
 *   informs the owner and never blocks anything (d-0143).
 *
 * Exports: CARD_EVENT_KINDS, CardEventKind, NewCardEvent, CardEvent.
 * Depends on: schemas/card, schemas/card-chat, schemas/ids, schemas/ticket, zod. No IO.
 */

import { z } from 'zod';
import { CardActor, CardTypeName } from '#/schemas/card.js';
import { ActionTaken } from '#/schemas/card-chat.js';
import { CardId } from '#/schemas/ids.js';
import { TicketStatus } from '#/schemas/ticket.js';

export const CARD_EVENT_KINDS = [
  'user_message',
  'director_message',
  'director_action',
  'close_suggested',
  'ticket_created',
  'ticket_state',
  'interaction_opened',
  'interaction_answered',
  'type_changed',
  'card_closed',
  'budget_warning',
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
  event(
    'director_message',
    text.extend({ actions_taken: z.array(ActionTaken).optional() }),
  ),
  event('director_action', ActionTaken),
  event('close_suggested', z.object({ reason: z.string().min(1) })),
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
  event(
    'budget_warning',
    z.object({
      threshold: z.number().positive(),
      spent_usd: z.number().nonnegative(),
      cap_usd: z.number().nonnegative(),
    }),
  ),
  event('note', text),
]);
export type NewCardEvent = z.infer<typeof NewCardEvent>;

/** A stored card event: the card it belongs to and its 0-based position in that card's history. */
export const CardEvent = z.intersection(
  NewCardEvent,
  z.object({ card_id: CardId, seq: z.number().int().nonnegative() }),
);
export type CardEvent = z.infer<typeof CardEvent>;
