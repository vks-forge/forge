/**
 * The facts a card view is built from.
 *
 * Why: the Board list, the Card page and the PATCH answer all show a card with the column
 *   rolled up from its tickets and pending questions. Keeping those facts together lets a
 *   route compute the column once and build both the summary and the detail from it.
 *
 * Exports: CardView.
 * Depends on: @forge/core (card, ticket and interaction types). Types only.
 */

import type { Card, CardColumn, Interaction, Ticket } from '@forge/core';

/** A card with the facts its column was rolled up from. */
export interface CardView {
  readonly card: Card;
  readonly tickets: readonly Ticket[];
  readonly pending: readonly Interaction[];
  readonly column: CardColumn;
}
