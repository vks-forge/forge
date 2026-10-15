/**
 * Reads a whole project's tickets or a whole window of runs by walking storage's pages.
 *
 * Why: the stats, cost and inbox reports need every ticket of a project or every run of a
 *   window, but storage only hands out bounded pages (so one query never loads an unbounded
 *   table in one go). These helpers walk the pages with the same exclusive cursors the list
 *   endpoints use, so a report sees each row exactly once even in a single transaction.
 *
 * Exports: collectTickets(), collectRuns().
 * Depends on: @forge/core (StorageTx, filters). IO: reads storage.
 */

import type { Run, RunListFilter, StorageTx, Ticket, TicketStatus } from '@forge/core';

const PAGE = 500;

/** Every ticket of `project` (its id), optionally only those in `statuses`. */
export async function collectTickets(
  tx: StorageTx,
  project: string,
  statuses?: readonly TicketStatus[],
): Promise<Ticket[]> {
  const all: Ticket[] = [];

  for (;;) {
    const last = all[all.length - 1];
    const page = await tx.tickets.listByProject(project, {
      ...(statuses ? { statuses } : {}),
      limit: PAGE,
      ...(last ? { after: { updated_at: last.updated_at, id: last.id } } : {}),
    });

    all.push(...page);
    if (page.length < PAGE) {
      return all;
    }
  }
}

/** Every run matching `filter` (its own `limit` and `after` are ignored). */
export async function collectRuns(
  tx: StorageTx,
  filter: Omit<RunListFilter, 'limit' | 'after'>,
): Promise<Run[]> {
  const all: Run[] = [];

  for (;;) {
    const last = all[all.length - 1];
    const page = await tx.runs.list({
      ...filter,
      limit: PAGE,
      ...(last ? { after: { started_at: last.started_at, id: last.id } } : {}),
    });

    all.push(...page);
    if (page.length < PAGE) {
      return all;
    }
  }
}
