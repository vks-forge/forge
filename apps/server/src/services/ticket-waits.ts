/**
 * Puts the real phase and wait line on ticket rows.
 *
 * Why: the Board, the Card page and the ticket page must say where a ticket really is (queued
 *   behind which ticket, held by a re-plan, waiting on an answer) rather than echo its status.
 *   The engine works that out for many tickets from one scheduling decision; this attaches the
 *   answer to the rows and makes `needs_you` true only for an open owner item, so no list
 *   counts a ticket whose answer was already given. It runs after the route's transaction
 *   closes because the engine opens its own.
 *
 * Exports: attachWaits().
 * Depends on: @forge/core (TicketSummary). IO: calls the engine (read-only).
 */

import type { TicketSummary, TicketWait } from '@forge/core';

/** Rows with `wait` set and `needs_you` taken from it; rows the engine does not know are returned as they were. */
export async function attachWaits<T extends Pick<TicketSummary, 'id' | 'needs_you'>>(
  engine: { explainWaits(ids: readonly string[]): Promise<Map<string, TicketWait>> },
  rows: readonly T[],
): Promise<Array<T & { wait?: TicketWait }>> {
  if (rows.length === 0) {
    return [];
  }

  const waits = await engine.explainWaits(rows.map((r) => r.id));

  return rows.map((row) => {
    const wait = waits.get(row.id);

    return wait ? { ...row, wait, needs_you: wait.phase === 'waiting_you' } : row;
  });
}
