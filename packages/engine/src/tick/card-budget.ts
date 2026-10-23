/**
 * Card budget warnings: spend crossing a share of the card's cap is reported, never enforced.
 *
 * Why: a card's budget is informational (d-0143). The owner should hear that a card is
 *   heading past its cap, but a warning must never stop the card or refuse a ticket, or a
 *   cost guard would become the dead end the flow is built to avoid (d-0135). When spend
 *   (the card's ticket runs and its Director steps) first reaches each threshold, one `budget_warning`
 *   event goes to the card history; the event is the record of "already told" for that threshold
 *   and that cap, so a later check, a restart or a second writer never repeats it, while a cap the
 *   owner changed (d-0143) warns afresh. The cap is core's `effectiveCardBudget` (the same answer the
 *   Inbox and the card page give). `addDirectorSpend` is the one door through which a Director step's
 *   dollars are written: it appends a dated row to the Director spend ledger (x-0017) and keeps the
 *   card's cached total (the one number the check reads) in the same transaction.
 *
 * Exports: BUDGET_THRESHOLDS, warnOnBudget(), addDirectorSpend(), warnLevelFor(), warnLevelForCard().
 * Depends on: @forge/core (card event schemas, card planning state, effectiveCardBudget), tick/card-chat-context (cardSpend), tick/card-log,
 *   tick/planning-state (directorFor). Writes inside the caller's transaction.
 */

import { effectiveCardBudget } from '@forge/core';
import type { CardId, StorageTx, TicketId } from '@forge/core';
import { cardSpend } from '#/tick/card-chat-context.js';
import { ENGINE_ACTOR, logCardEvent } from '#/tick/card-log.js';
import { directorFor } from '#/tick/planning-state.js';
import type { SpendMeta } from '#/types/card-budget.types.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

/** Shares of the cap that each warn once: a heads-up at 80 percent and the cap itself. */
export const BUDGET_THRESHOLDS: readonly number[] = [0.8, 1];

const PAGE = 200;

/** `<threshold>@<cap>`: a warning belongs to the cap it was written for, so a new cap warns again. */
const warnKey = (threshold: number, cap: number): string => `${threshold}@${cap}`;

/** The (threshold, cap) pairs a `budget_warning` already exists for. */
async function warnedThresholds(tx: StorageTx, cardId: CardId): Promise<Set<string>> {
  const seen = new Set<string>();
  let afterSeq: number | undefined;
  for (;;) {
    const page = await tx.cardEvents.list(cardId, {
      ...(afterSeq === undefined ? {} : { afterSeq }),
      limit: PAGE,
    });

    for (const e of page) {
      if (e.kind === 'budget_warning') {
        seen.add(warnKey(e.payload.threshold, e.payload.cap_usd));
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
 * The warning level a card without its own cap falls back to, for `project` (a project id): the
 * Director's `budget_warning_usd` in force there. Callers that hold an `EngineCtx` pass this to
 * `warnOnBudget` and `addDirectorSpend`, so no path warns against nothing.
 */
export async function warnLevelFor(
  ctx: EngineCtx,
  tx: StorageTx,
  project: string,
): Promise<number> {
  const slug = (await tx.projects.get(project))?.slug ?? project;

  return directorFor(ctx, slug).director.budget_warning_usd;
}

/** The warning level for a card's project, or undefined when the card is gone. */
export async function warnLevelForCard(
  ctx: EngineCtx,
  tx: StorageTx,
  cardId: CardId,
): Promise<number | undefined> {
  const card = await tx.cards.get(cardId);

  return card ? warnLevelFor(ctx, tx, card.project) : undefined;
}

/**
 * Writes a `budget_warning` for each threshold the card's spend has reached and has not warned
 * about yet. Spend is the card's ticket runs plus its Director steps (d-0143). The cap is
 * `effectiveCardBudget`: the card's own, else `fallbackCapUsd` (the warning level in force for its project).
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
  if (!card) {
    return;
  }

  const cap = effectiveCardBudget(card, {
    usd: fallbackCapUsd ?? 0,
    source: 'forge',
  }).cap_usd;

  if (cap === null) {
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
  for (const threshold of reached.filter((t) => !warned.has(warnKey(t, cap)))) {
    await logCardEvent(tx, card.id, {
      kind: 'budget_warning',
      at,
      actor: ENGINE_ACTOR,
      payload: { threshold, spent_usd: spent, cap_usd: cap },
    });
  }
}

/**
 * The one door for a Director step's cost: appends a dated row to the ledger and, when the step
 * belongs to a card, adds the dollars to the card's cached total in the same transaction, then
 * warns if a threshold was crossed. A step on a ticket with no card is recorded with a null card,
 * so Cost and Overview still count it. Nothing is written for a step with no price unless the
 * caller says the price is unknown (`recorded: false`); a step tied to neither card nor ticket has
 * no project and is skipped. The card's thresholds are checked on every call, priced or not.
 */
export async function addDirectorSpend(
  tx: StorageTx,
  cardId: CardId | undefined,
  usd: number,
  at: string,
  fallbackCapUsd: number | undefined,
  meta: SpendMeta,
): Promise<void> {
  const recorded = meta.recorded ?? true;
  if (usd <= 0 && recorded) {
    // Nothing to write, but ticket runs may have pushed the card over a threshold since the last check.
    await warnOnBudget(tx, cardId, at, fallbackCapUsd);

    return;
  }

  const card = cardId === undefined ? null : await tx.cards.get(cardId);
  const ticket =
    meta.ticketId === undefined ? null : await tx.tickets.get(meta.ticketId as TicketId);

  const project = card?.project ?? ticket?.project;
  if (project === undefined) {
    return;
  }

  await tx.directorSpend.append({
    project,
    ...(card ? { card_id: card.id } : {}),
    ...(ticket ? { ticket_id: ticket.id } : {}),
    kind: meta.kind,
    ...(meta.model === undefined ? {} : { model: meta.model }),
    usd: Math.max(0, usd),
    recorded,
    at,
  });

  if (!card || usd <= 0) {
    return;
  }

  const planning = await tx.cardPlanning.get(card.id);
  await tx.cardPlanning.update(card.id, {
    grill: {
      ...planning.grill,
      director_spend_usd: planning.grill.director_spend_usd + usd,
    },
  });

  await warnOnBudget(tx, card.id, at, fallbackCapUsd);
}
