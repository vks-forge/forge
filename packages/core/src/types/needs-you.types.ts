/**
 * Types for the needs-you item rules (domain/needs-you).
 *
 * Why: the rules take a card or ticket reduced to the few fields they read, so the server can
 *   call them with a stored row and a test with a literal, and a scan of history says in its
 *   type whether the pages read so far were enough to decide.
 *
 * Exports: RaisedEvent, RaiseScan, CardNeedsYouInput, TicketNeedsYouInput.
 * Depends on: schemas/card, schemas/card-event, schemas/escalation, schemas/ticket. Types only.
 */

import type { Card } from '#/schemas/card.js';
import type { CardEvent } from '#/schemas/card-event.js';
import type { EscalationAction, EscalationView } from '#/schemas/escalation.js';
import type { Ticket } from '#/schemas/ticket.js';

/** A stored `needs_you` event. */
export type RaisedEvent = Extract<CardEvent, { kind: 'needs_you' }>;

/**
 * What a newest-first read of history says about the card's raise: `raised` (the newest one is
 * still open), `settled` (something answered it first) or `unknown` (neither seen yet; read
 * older events and scan again).
 */
export type RaiseScan =
  | { readonly state: 'raised'; readonly event: RaisedEvent }
  | { readonly state: 'settled' }
  | { readonly state: 'unknown' };

export interface CardNeedsYouInput {
  readonly card: Pick<Card, 'needs_you'> & Partial<Pick<Card, 'closed_reason'>>;
  readonly scan: RaiseScan;
  /** Every pending escalation of the card's tickets, any stage. */
  readonly escalations: readonly EscalationView[];
}

export interface TicketNeedsYouInput {
  readonly ticket: Pick<Ticket, 'id' | 'status' | 'updated_at'>;
  /** Every pending escalation of the ticket, any stage. */
  readonly escalations: readonly EscalationView[];
  /** What the ticket page offers for the ticket's own wait (`wait_actions`). */
  readonly waitActions: readonly EscalationAction[];
}
