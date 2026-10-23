/**
 * Loads the stored facts of a ticket or card and builds its history.
 *
 * Why: a history is merged from six tables. The merge is pure (core `buildHistory`); this file is
 *   the one place that reads those tables in a single transaction, so the picture is consistent (a
 *   run row never ahead of the event that started it). Runs of the project's other tickets are
 *   read too, only so a long wait can name the ticket that held the Worker slot.
 *
 * Exports: loadTicketHistory(), loadCardHistory().
 * Depends on: @forge/core (buildHistory, buildCardHistory, storage types). IO: reads storage.
 */

import { buildCardHistory, buildHistory } from '@forge/core';
import type { CardId, HistoryEntry, StorageTx, TicketId } from '@forge/core';

/** The most card events one history reads; a card past this shows its newest. */
const MAX_EVENTS = 5000;
/** How far before its first wake a ticket's neighbours may have started and still held the slot. */
const SLOT_LOOKBACK_MS = 12 * 3_600_000;
const OTHER_RUNS = 300;

/** The ticket's history, oldest first, or null for an unknown ticket. */
export async function loadTicketHistory(
  tx: StorageTx,
  id: TicketId,
): Promise<HistoryEntry[] | null> {
  const ticket = await tx.tickets.get(id);
  if (!ticket) {
    return null;
  }

  const [events, interactions, runs, stageRuns, wakes, gates] = await Promise.all([
    // A ticket made outside a card has no card events; its rows still tell the story.
    ticket.card_id === undefined
      ? Promise.resolve([])
      : tx.cardEvents.list(ticket.card_id, { order: 'desc', limit: MAX_EVENTS }),
    tx.interactions.listByTicket(id),
    tx.runs.listByTicket(id),
    tx.stageRuns.listByTicket(id),
    tx.wakeRequests.listByTicket(id),
    tx.gateResults.listByTicket(id),
  ]);

  const firstWake = wakes.map((w) => Date.parse(w.not_before ?? w.created_at)).sort()[0];
  const neighbours =
    firstWake === undefined
      ? []
      : await tx.runs.list({
          project: ticket.project,
          since: new Date(firstWake - SLOT_LOOKBACK_MS).toISOString(),
          limit: OTHER_RUNS,
        });

  return buildHistory({
    ticketId: id,
    events: events.reverse(),
    interactions,
    runs,
    stageRuns,
    wakes,
    gates,
    otherRuns: neighbours.filter((r) => r.ticket_id !== id),
  });
}

/** The card's history, oldest first, or null for an unknown card. */
export async function loadCardHistory(
  tx: StorageTx,
  id: CardId,
): Promise<HistoryEntry[] | null> {
  if (!(await tx.cards.get(id))) {
    return null;
  }

  const events = await tx.cardEvents.list(id, { order: 'desc', limit: MAX_EVENTS });

  return buildCardHistory({ events: events.reverse() });
}
