/**
 * Input of the engine's inbox ticket insert.
 *
 * Why: intake and the card chat both file tickets; naming what a caller may decide (title,
 *   body, type, lane hint, who) keeps the number, the `inbox` start and the card link out of
 *   their hands.
 *
 * Exports: NewInboxTicket.
 * Depends on: @forge/core (card and ticket schemas). Types only.
 */

import type { CardActor, CardId, Lane, Ticket } from '@forge/core';

/** What a caller decides about the new ticket; everything else is a fixed `inbox` start. */
export interface NewInboxTicket {
  readonly cardId: CardId;
  readonly title: string;
  readonly body: string;
  readonly type: Ticket['type'];
  readonly lane?: Lane;
  readonly createdByIntake?: number;
  readonly at: string;
  readonly actor: CardActor;
}
