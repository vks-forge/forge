/**
 * Card phase sweep: repairs cards whose phase disagrees with their tickets.
 *
 * Why: the Board and the owner trust the card phase. Card DCP-C2 sat in Done while its tickets
 *   were open because they were filed by the card chat after it finished, before a finished card
 *   could reopen, and nothing ever looked at it again. Following tickets on every move keeps new
 *   data right; this sweep repairs data written before that, and anything a race or a crash
 *   left behind. Every tick it re-checks the cards that own an unfinished ticket (cheap: one
 *   read per open status); the first tick after a start re-checks every card, which also
 *   catches a running card whose tickets all finished. It only calls `syncCardWithTickets()`, so
 *   the card still moves through the one door and a second pass changes nothing.
 *
 * Exports: sweepCardPhases().
 * Depends on: @forge/core (card ids), tick/card-phase, types/engine-state. Writes inside one transaction.
 */

import type { Card, CardId, StorageTx } from '@forge/core';
import { syncCardWithTickets } from '#/tick/card-phase.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

const OPEN_STATUSES = [
  'inbox',
  'planned',
  'in_progress',
  'blocked',
  'waiting_human',
  'verifying',
  'review',
  'needs_signoff',
] as const;

const PAGE = 200;

/** Phases where a card follows its tickets. */
const FOLLOWING: readonly Card['phase'][] = ['approved', 'queued', 'in_progress', 'done'];

/** Cards of every project, page by page. */
async function allCardIds(tx: StorageTx): Promise<CardId[]> {
  const ids: CardId[] = [];
  for (const project of await tx.projects.list()) {
    let after: { updated_at: string; id: string } | undefined;
    for (;;) {
      const page = await tx.cards.listByProject(project.id, {
        limit: PAGE,
        ...(after === undefined ? {} : { after }),
      });

      ids.push(...page.map((c) => c.id));
      const last = page[page.length - 1];
      if (page.length < PAGE || !last) {
        break;
      }

      after = { updated_at: last.updated_at, id: last.id };
    }
  }

  return ids;
}

/** Cards that own a ticket that is not finished. */
async function cardsWithOpenTickets(tx: StorageTx): Promise<CardId[]> {
  const ids = new Set<CardId>();
  for (const status of OPEN_STATUSES) {
    for (const t of await tx.tickets.listByStatus(status)) {
      if (t.card_id) {
        ids.add(t.card_id);
      }
    }
  }

  return [...ids];
}

/** Syncs every candidate card with its tickets; returns the cards whose phase or flag changed. */
export async function sweepCardPhases(ctx: EngineCtx): Promise<string[]> {
  return ctx.deps.storage.transaction(async (tx) => {
    const candidates = ctx.state.firstTick
      ? await allCardIds(tx)
      : await cardsWithOpenTickets(tx);

    const changed: string[] = [];
    for (const id of candidates) {
      const before = await tx.cards.get(id);
      if (!before || !FOLLOWING.includes(before.phase)) {
        continue;
      }

      await syncCardWithTickets(tx, id, ctx.nowIso);
      const after = await tx.cards.get(id);
      if (after && after.phase_version !== before.phase_version) {
        changed.push(id);
      }
    }

    return changed;
  });
}
