/**
 * Card budget warnings: spend crossing a share of the card's cap is reported, never enforced.
 *
 * Why: a card's budget is informational (d-0143). The owner should hear that a card is
 *   heading past its cap, but a warning must never stop the card or refuse a ticket, or a
 *   cost guard would become the dead end the flow is built to avoid (d-0135). When spend
 *   (the card's ticket runs and its Director steps) first reaches each threshold, one `budget_warning`
 *   event goes to the card history; the event is the record of "already told", so a later
 *   check, a restart or a second writer never repeats it.
 *
 * Exports: BUDGET_THRESHOLDS, warnOnBudget().
 * Depends on: @forge/core (card event schemas, card planning state), tick/card-chat-context (cardSpend), tick/card-log.
 *   Writes inside the caller's transaction.
 */

import type { CardId, StorageTx } from '@forge/core';
import { cardSpend } from '#/tick/card-chat-context.js';
import { ENGINE_ACTOR, logCardEvent } from '#/tick/card-log.js';

/** Shares of the cap that each warn once: a heads-up at 80 percent and the cap itself. */
export const BUDGET_THRESHOLDS: readonly number[] = [0.8, 1];

const PAGE = 200;

/** Thresholds a `budget_warning` already exists for. */
async function warnedThresholds(tx: StorageTx, cardId: CardId): Promise<Set<number>> {
  const seen = new Set<number>();
  let afterSeq: number | undefined;
  for (;;) {
    const page = await tx.cardEvents.list(cardId, {
      ...(afterSeq === undefined ? {} : { afterSeq }),
      limit: PAGE,
    });

    for (const e of page) {
      if (e.kind === 'budget_warning') {
        seen.add(e.payload.threshold);
      }
    }

    const last = page[page.length - 1];
    if (page.length < PAGE || !last) {
      return seen;
    }

    afterSeq = last.seq;
  }
}

/**
 * Writes a `budget_warning` for each threshold the card's spend has reached and has not warned
 * about yet. Spend is the card's ticket runs plus its Director planning steps (d-0143). The cap
 * is the card's own; a card without one uses `fallbackCapUsd` (the Director's warning level).
 */
export async function warnOnBudget(
  tx: StorageTx,
  cardId: CardId | undefined,
  at: string,
  fallbackCapUsd?: number,
): Promise<void> {
  if (cardId === undefined) {
    return;
  }

  const card = await tx.cards.get(cardId);
  const cap = card?.budget_cap_usd ?? fallbackCapUsd;
  if (!card || cap === undefined || cap <= 0) {
    return;
  }

  const planning = await tx.cardPlanning.get(card.id);
  const spent =
    (await cardSpend(tx, await tx.tickets.listByCard(card.id))) +
    planning.grill.director_spend_usd;

  const reached = BUDGET_THRESHOLDS.filter((t) => spent >= cap * t);
  if (reached.length === 0) {
    return;
  }

  const warned = await warnedThresholds(tx, card.id);
  for (const threshold of reached.filter((t) => !warned.has(t))) {
    await logCardEvent(tx, card.id, {
      kind: 'budget_warning',
      at,
      actor: ENGINE_ACTOR,
      payload: { threshold, spent_usd: spent, cap_usd: cap },
    });
  }
}
