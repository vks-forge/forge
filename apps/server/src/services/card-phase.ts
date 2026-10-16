/**
 * Card phase moves for the HTTP routes: the same door the engine uses, applied in a route's transaction.
 *
 * Why: closing a card from `PATCH /cards/:id` is an owner's act that must change the stored
 *   phase as well as the reason, and the phase may only change through `transitionCard()`
 *   with a compare-and-swap on `phase_version` (code.md rule 6, d-0134). Routes compose that
 *   pure function with the storage port here, so a route cannot write `phase` directly and a
 *   racing writer is reported as a conflict instead of being overwritten.
 *
 * Exports: moveCardPhase().
 * Depends on: @forge/core (transitionCard), services/http/http-errors. IO: writes storage.
 */

import { transitionCard } from '@forge/core';
import type { CardId, CardPhaseEvent, StorageTx } from '@forge/core';
import { HttpError } from '#/services/http/http-errors.js';

/** Applies `event` to the card; throws 404 for an unknown card and 409 when the move is illegal or a writer won the race. */
export async function moveCardPhase(
  tx: StorageTx,
  cardId: CardId,
  event: Omit<CardPhaseEvent, 'expected_version'>,
  at: string,
): Promise<void> {
  const card = await tx.cards.get(cardId);
  if (!card) {
    throw new HttpError(404, 'card_not_found', `no card ${cardId}`);
  }

  const next = transitionCard(card, { ...event, expected_version: card.phase_version });
  if (!next.ok) {
    throw new HttpError(
      409,
      'card_phase_conflict',
      `card ${cardId} cannot do ${event.type} from ${card.phase}`,
    );
  }

  const stored = await tx.cards.updatePhase(cardId, card.phase_version, {
    phase: next.value.phase,
    needs_you: next.value.needs_you,
    updated_at: at,
  });

  if (!stored) {
    throw new HttpError(409, 'card_phase_conflict', `card ${cardId} changed meanwhile`);
  }
}
