/**
 * The facts a card view is built from.
 *
 * Why: the Board list, the Card page and the PATCH answer all show a card with the column
 *   rolled up from its phase, its tickets and pending questions, and with its dependencies.
 *   Keeping those facts together lets a route compute them once and build both the summary
 *   and the detail from it.
 *
 * Exports: CardView.
 * Depends on: @forge/core (card, ticket and interaction types). Types only.
 */

import type { Card, CardColumn, CardId, Interaction, Ticket } from '@forge/core';

/** A card with the facts its column was rolled up from, and its dependency edges. */
export interface CardView {
  readonly card: Card;
  readonly tickets: readonly Ticket[];
  readonly pending: readonly Interaction[];
  readonly column: CardColumn;
  /** Whether the card, or one of its tickets, waits on the owner (the overlay, not the stored flag). */
  readonly needsYou: boolean;
  /** Cards this one waits for. */
  readonly dependsOn: readonly CardId[];
  /** Cards waiting for this one. */
  readonly blocks: readonly CardId[];
  /** Points still open in the grill while the card is being shaped, else null. */
  readonly openPoints: number | null;
  /** The newest plan version, or null before a plan exists. */
  readonly planVersion: number | null;
}
