/**
 * Card phase moves: the engine's one way to change a card's phase.
 *
 * Why: the card phase decides what the Director may do next and what the owner sees, so every
 *   change must come out of `transitionCard()` (code.md rule 6, d-0134) and be stored with a
 *   compare-and-swap on `phase_version`, so a racing writer loses instead of overwriting. The
 *   planning flow states what happened as an event; this file reads the card, runs the
 *   event, and stores the result. Cards that run tickets (the PR fast path, and every
 *   approved plan later) also follow their tickets: the first ticket that leaves the inbox
 *   starts the card, and the last live ticket done completes it, so the Board never shows a
 *   finished card as running. That follow goes through the same door.
 *
 * Exports: moveCardTx(), syncCardWithTickets().
 * Depends on: @forge/core (transitionCard), types/card-phase. Writes inside the caller's transaction.
 */

import { transitionCard } from '@forge/core';
import type { CardId, CardPhaseEvent, StorageTx } from '@forge/core';
import type { CardMoveResult } from '#/types/card-phase.types.js';

/** Applies `event` to the card inside an open transaction. */
export async function moveCardTx(
  tx: StorageTx,
  cardId: CardId,
  event: Omit<CardPhaseEvent, 'expected_version'>,
  at: string,
): Promise<CardMoveResult> {
  const card = await tx.cards.get(cardId);
  if (!card) {
    return { ok: false, reason: `unknown card ${cardId}` };
  }

  const next = transitionCard(card, { ...event, expected_version: card.phase_version });
  if (!next.ok) {
    return { ok: false, reason: `${cardId}: ${JSON.stringify(next.error)}` };
  }

  const stored = await tx.cards.updatePhase(cardId, card.phase_version, {
    phase: next.value.phase,
    needs_you: next.value.needs_you,
    updated_at: at,
  });

  if (!stored) {
    return { ok: false, reason: `${cardId}: stale phase_version` };
  }

  return { ok: true, card: { ...card, ...next.value, updated_at: at } };
}

/**
 * Moves the card forward when its tickets did: `start` once a live ticket is past the inbox,
 * `complete` once every live (not cancelled) ticket is done. Does nothing for a card without
 * live tickets or one that is not at a phase those moves apply to.
 */
export async function syncCardWithTickets(
  tx: StorageTx,
  cardId: CardId | undefined,
  at: string,
): Promise<void> {
  if (cardId === undefined) {
    return;
  }

  const live = (await tx.tickets.listByCard(cardId)).filter(
    (t) => t.status !== 'cancelled',
  );

  const card = await tx.cards.get(cardId);
  if (!card || live.length === 0) {
    return;
  }

  if (
    (card.phase === 'approved' || card.phase === 'queued') &&
    live.some((t) => t.status !== 'inbox')
  ) {
    await moveCardTx(tx, cardId, { type: 'start' }, at);
  }

  const now = await tx.cards.get(cardId);
  if (now?.phase === 'in_progress' && live.every((t) => t.status === 'done')) {
    await moveCardTx(tx, cardId, { type: 'complete' }, at);
  }
}
