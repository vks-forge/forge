/**
 * Closing a card closes its work: cancel what is unfinished, stop its runs, settle its waits.
 *
 * Why: the owner closes a card to say "stop working on this". Before, only the card's label
 *   changed: its tickets kept waiting, a lane-hold escalation stayed on screen, and "Run as
 *   Express" on it started Worker runs (and model cost) for dropped work (DCP-C1 and DCP-1). So
 *   closing cancels every ticket that is not `done` or `cancelled` through `transition()`, closes
 *   their pending waits, and after the commit stops live runs and removes worktrees, the same way
 *   a cancel does. The same repair runs for cards that were closed before this existed (and for
 *   any ticket that slipped through a race): an idempotent sweep each tick cancels the open
 *   tickets of closed cards and writes one card note saying what it cancelled. Reopening a card
 *   never revives cancelled tickets: new work is new tickets.
 *
 * Exports: isCardClosed(), closeCardWork(), sweepClosedCards().
 * Depends on: @forge/core (card and ticket types), tick/card-log, tick/card-notify, tick/ticket-cancel,
 *   tick/tick-requests. Writes storage; runs and worktrees go through the EngineDeps ports.
 */

import { TERMINAL_STATUSES } from '@forge/core';
import type { Card, CardId, StorageTx, Ticket } from '@forge/core';
import { iso } from '#/shared/time.js';
import { ENGINE_ACTOR, logCardEvent } from '#/tick/card-log.js';
import { notifyCard } from '#/tick/card-notify.js';
import { cancelTicketsTx, stopCancelled } from '#/tick/ticket-cancel.js';
import { requestTick } from '#/tick/tick-requests.js';
import type { EngineCtx, EngineState } from '#/types/engine-state.types.js';
import type { EngineDeps } from '#/types/engine.types.js';

/** Whether the owner closed the card (a reason is stored, or its phase is `closed`). */
export function isCardClosed(card: Pick<Card, 'phase' | 'closed_reason'>): boolean {
  return card.closed_reason !== undefined || card.phase === 'closed';
}

/** Cancels the card's unfinished tickets inside `tx` and writes the note; returns the tickets that moved. */
async function cancelOpenWorkTx(
  tx: StorageTx,
  cardId: CardId,
  nowIso: string,
): Promise<Ticket[]> {
  const open = (await tx.tickets.listByCard(cardId)).filter(
    (t) => !TERMINAL_STATUSES.includes(t.status),
  );

  if (open.length === 0) {
    return [];
  }

  const cancelled = await cancelTicketsTx(
    tx,
    open.map((t) => t.id),
    nowIso,
  );

  if (cancelled.length > 0) {
    await logCardEvent(tx, cardId, {
      kind: 'note',
      at: nowIso,
      actor: ENGINE_ACTOR,
      payload: {
        text: `The card is closed, so ${cancelled.length === 1 ? 'its open ticket was' : 'its open tickets were'} cancelled: ${cancelled.map((t) => t.id).join(', ')}.`,
      },
    });
  }

  return cancelled;
}

/** After the commit: stop live runs, remove worktrees, wake the tick and the card's watchers. */
async function afterCancel(
  deps: EngineDeps,
  state: EngineState,
  cancelled: readonly Ticket[],
): Promise<void> {
  // Nothing moved: no tick to ask for (a needless request would also mask the next real one).
  if (cancelled.length === 0) {
    return;
  }

  for (const t of cancelled) {
    await stopCancelled(deps, state, t);
  }

  requestTick(deps, state);
  const cardIds = new Set(cancelled.flatMap((t) => (t.card_id ? [t.card_id] : [])));
  for (const id of cardIds) {
    await notifyCard(deps, id);
  }
}

/**
 * Cancels the unfinished tickets of `cardId` if the card is closed; returns their ids. A card
 * that is open, unknown or already clear of open work changes nothing, so calling it twice is safe.
 */
export async function closeCardWork(
  deps: EngineDeps,
  state: EngineState,
  cardId: string,
): Promise<string[]> {
  const nowIso = iso(deps.clock.now());
  const cancelled = await deps.storage.transaction(async (tx) => {
    const card = await tx.cards.get(cardId as CardId);

    return card && isCardClosed(card) ? cancelOpenWorkTx(tx, card.id, nowIso) : [];
  });

  await afterCancel(deps, state, cancelled);

  return cancelled.map((t) => t.id);
}

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

/** Every tick: cancels the open tickets of closed cards (the repair for DCP-1, and for any race). */
export async function sweepClosedCards(ctx: EngineCtx): Promise<string[]> {
  const { deps, state } = ctx;
  const cancelled = await deps.storage.transaction(async (tx) => {
    const cardIds = new Set<CardId>();
    for (const status of OPEN_STATUSES) {
      for (const t of await tx.tickets.listByStatus(status)) {
        if (t.card_id) {
          cardIds.add(t.card_id);
        }
      }
    }

    const moved: Ticket[] = [];
    for (const id of cardIds) {
      const card = await tx.cards.get(id);
      if (card && isCardClosed(card)) {
        moved.push(...(await cancelOpenWorkTx(tx, id, ctx.nowIso)));
      }
    }

    return moved;
  });

  await afterCancel(deps, state, cancelled);

  return cancelled.map((t) => t.id);
}
