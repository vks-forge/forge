/**
 * Ticket stamp: a short string that changes whenever a ticket does.
 *
 * Why: the ticket's pipeline view is a separate read from the ticket itself, and the engine does
 *   not announce when a stage changes. The ticket page already refreshes the ticket quickly (a
 *   live stream, with a poll behind it), and every stage change also moves the ticket: its
 *   status, its change time, its rework count or its runs. Comparing this stamp between renders
 *   tells the pipeline strip to refetch exactly when something happened, without polling harder.
 *
 * Exports: ticketStamp().
 * Depends on: schemas/tickets (type). No IO.
 */

import type { TicketDetail } from '#/schemas/tickets.js';

export function ticketStamp(detail: Pick<TicketDetail, 'ticket' | 'runs'>): string {
  const { ticket } = detail;

  return `${ticket.status}|${ticket.updated_at}|${ticket.rework_count}|${detail.runs.length}`;
}
