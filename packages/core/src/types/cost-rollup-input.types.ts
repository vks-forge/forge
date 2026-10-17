/**
 * Input of `rollupCardCost`.
 *
 * Why: the card cost is built from rows the server reads (the card's tickets, one grouped
 *   sum of run cost per ticket, the Director spend stored on the card's planning state).
 *   Naming the bundle keeps the pure function independent of storage.
 *
 * Exports: CardCostInput.
 * Depends on: none. Types only.
 */

export interface CardCostInput {
  /** Dollars the card's Director steps cost. */
  readonly directorUsd: number;
  /** The card's tickets in card order. */
  readonly tickets: readonly { readonly id: string; readonly title: string }[];
  /** Recorded run cost summed per ticket id; a missing id means zero. */
  readonly costByTicket: Readonly<Record<string, number>>;
}
