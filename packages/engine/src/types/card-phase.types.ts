/**
 * Result of a card phase move.
 *
 * Why: the planning flow and the ticket follow-through ask the engine to move a card and must
 *   tell "done" from "refused" without a throw: a card that is gone, an event that is illegal
 *   from its phase, or a writer that won the race are normal outcomes of concurrent work, and
 *   one stale writer must not crash a tick. Naming the result lets callers branch on it.
 *
 * Exports: CardMoveResult.
 * Depends on: @forge/core (card schema). Types only.
 */

import type { Card } from '@forge/core';

/** Why a move did not happen: the card is gone, the event is illegal from its phase, or a writer won the race. */
export type CardMoveResult =
  | { readonly ok: true; readonly card: Card }
  | { readonly ok: false; readonly reason: string };
