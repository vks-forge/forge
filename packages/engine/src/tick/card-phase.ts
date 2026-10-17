/**
 * Card phase moves: the engine's one way to change a card's phase.
 *
 * Why: the card phase decides what the Director may do next and what the owner sees, so every
 *   change must come out of `transitionCard()` (code.md rule 6, d-0134) and be stored with a
 *   compare-and-swap on `phase_version`, so a racing writer loses instead of overwriting. The
 *   planning flow states what happened as an event; this file reads the card, runs the
 *   event, and stores the result. Cards that run tickets (the PR fast path, and every
 *   approved plan later) also follow their tickets, both ways: the first ticket that leaves the
 *   inbox starts the card, the last live ticket done completes it, and a ticket that is not
 *   done on a finished card reopens it, so the Board never shows a finished card with open work
 *   or a running card with none. The owner flag follows waiting tickets. That follow goes
 *   through the same door.
 *
 * Exports: moveCardTx(), syncCardWithTickets().
 * Depends on: @forge/core (transitionCard, cardNeedsYou), tick/card-log, types/card-phase. Writes inside the caller's transaction.
 */

import { cardNeedsYou, transitionCard } from '@forge/core';
import type { Card, CardId, CardPhaseEvent, StorageTx } from '@forge/core';
import { ENGINE_ACTOR, logCardEvent } from '#/tick/card-log.js';
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

/** The card's ticket ids as one list for a note: `FG-2`, `FG-2 and FG-3`, `FG-2, FG-3 and FG-4`. */
function listIds(ids: readonly string[]): string {
  return ids.length < 2
    ? (ids[0] ?? '')
    : `${ids.slice(0, -1).join(', ')} and ${ids[ids.length - 1]}`;
}

/** Sets or clears the stored "waits on the owner" flag through the phase door; no-op when it already matches. */
async function flagCard(
  tx: StorageTx,
  card: Card,
  on: boolean,
  at: string,
): Promise<boolean> {
  if (card.needs_you === on) {
    return false;
  }

  const moved = await moveCardTx(
    tx,
    card.id,
    { type: on ? 'needs_you_set' : 'needs_you_cleared' },
    at,
  );

  return moved.ok;
}

/**
 * Makes the card agree with its tickets, both ways, through the one card door:
 *  - `start` once a live ticket that is not already done is past the inbox, or all are done (an
 *    earlier plan's done tickets never start a follow-up plan);
 *  - `complete` once every live (not cancelled) ticket is done;
 *  - `resume_work` (with a note) when a done card has a live ticket that is not done;
 *  - an in-progress card flags the owner while a live ticket waits on them, and when every
 *    ticket was cancelled (so it does not run silently with nothing to run).
 * Does nothing for a closed card, a card without tickets, or phases those moves do not apply to.
 */
export async function syncCardWithTickets(
  tx: StorageTx,
  cardId: CardId | undefined,
  at: string,
): Promise<void> {
  if (cardId === undefined) {
    return;
  }

  const all = await tx.tickets.listByCard(cardId);
  const live = all.filter((t) => t.status !== 'cancelled');
  const unfinished = live.filter((t) => t.status !== 'done');
  const first = await tx.cards.get(cardId);
  if (!first || first.phase === 'closed' || first.closed_reason !== undefined) {
    return;
  }

  if (all.length === 0) {
    return;
  }

  if (live.length === 0) {
    if (first.phase === 'in_progress' && (await flagCard(tx, first, true, at))) {
      await logCardEvent(tx, cardId, {
        kind: 'note',
        at,
        actor: ENGINE_ACTOR,
        payload: {
          text: 'Every ticket of this card was cancelled. Close the card, or ask the Director for more work.',
        },
      });
    }

    return;
  }

  if (
    (first.phase === 'approved' || first.phase === 'queued') &&
    (unfinished.length === 0 || unfinished.some((t) => t.status !== 'inbox'))
  ) {
    await moveCardTx(tx, cardId, { type: 'start' }, at);
  }

  let now = await tx.cards.get(cardId);
  if (now?.phase === 'in_progress' && unfinished.length === 0) {
    await moveCardTx(tx, cardId, { type: 'complete' }, at);
  } else if (now?.phase === 'done' && unfinished.length > 0) {
    const moved = await moveCardTx(tx, cardId, { type: 'resume_work' }, at);
    if (moved.ok) {
      const ids = listIds(unfinished.map((t) => t.id));
      await logCardEvent(tx, cardId, {
        kind: 'note',
        at,
        actor: ENGINE_ACTOR,
        payload: {
          text: `Reopened: ${ids} ${unfinished.length === 1 ? 'is' : 'are'} not finished.`,
        },
      });
    }
  }

  now = await tx.cards.get(cardId);
  if (now?.phase === 'in_progress') {
    const waiting = cardNeedsYou(
      { needs_you: false },
      live,
      await tx.interactions.listPendingByCard(cardId),
    );

    await flagCard(tx, now, waiting, at);
  }
}
