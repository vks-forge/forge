/**
 * Card log: the engine's one way to write to a card's history.
 *
 * Why: the Card page shows what happened to a request in order, and the Board orders cards
 *   by their last activity. Every engine write that touches a card (a ticket made, a ticket
 *   moved, a question opened or answered) goes through this one function inside the same
 *   transaction as the change it describes, so the history can never claim something that
 *   was rolled back or miss something that committed, and `updated_at` moves with each entry.
 *   A ticket with no card (a row from before cards existed and not migrated) is skipped
 *   rather than failing the ticket change it rode on.
 *
 * Exports: ENGINE_ACTOR, logCardEvent().
 * Depends on: @forge/core (card schemas, storage tx). Writes inside the caller's transaction.
 */

import type { CardActor, CardEvent, CardId, NewCardEvent, StorageTx } from '@forge/core';

/** Who the card history names for changes the engine makes on its own. */
export const ENGINE_ACTOR: CardActor = { type: 'director', id: 'engine' };

/** Appends `event` to the card's history and bumps the card's `updated_at`; returns the stored event, or undefined without a card id. */
export async function logCardEvent(
  tx: StorageTx,
  cardId: CardId | undefined,
  event: NewCardEvent,
): Promise<CardEvent | undefined> {
  if (cardId === undefined) {
    return undefined;
  }

  const stored = await tx.cardEvents.append(cardId, event);
  await tx.cards.update(cardId, { updated_at: event.at });

  return stored;
}
