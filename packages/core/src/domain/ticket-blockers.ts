/**
 * Ticket blockers and cancel eligibility: the shared answers behind "waiting on", "who depends
 * on this" and "can it be cancelled".
 *
 * Why: the scheduler decides whether a ticket may start, the ticket page says what it still waits
 *   for, and the cancel dialog names the tickets that wait on it. If each computed it alone, a done
 *   ticket would keep reading "Waiting on FR-5" (the stored `blocked_by` lists every dependency
 *   for ever), and a cancelled ticket could strand its dependents. One rule: a blocker is open
 *   until it is done (a cancelled blocker never unblocks), a finished ticket waits on nothing, and
 *   a ticket can be cancelled while it is unfinished and its card is open.
 *
 * Exports: openBlockerIds(), openDependentIds(), canCancelTicket().
 * Depends on: schemas/ticket. No IO.
 */

import { TERMINAL_STATUSES } from '#/schemas/ticket.js';
import type { TicketStatus } from '#/schemas/ticket.js';

/** The ids in `ticket.blocked_by` that are not done yet; none once the ticket itself is finished. An unknown id counts as open. */
export function openBlockerIds(
  ticket: { readonly status: TicketStatus; readonly blocked_by: readonly string[] },
  statusOf: (id: string) => TicketStatus | undefined,
): string[] {
  if (TERMINAL_STATUSES.includes(ticket.status)) {
    return [];
  }

  return ticket.blocked_by.filter((id) => statusOf(id) !== 'done');
}

/** Every ticket of `open` that waits, directly or through another of them, on `ticketId`, in discovery order. */
export function openDependentIds(
  open: readonly { readonly id: string; readonly blocked_by: readonly string[] }[],
  ticketId: string,
): string[] {
  const found = new Set<string>();
  const queue = [ticketId];
  while (queue.length > 0) {
    const next = queue.shift() as string;
    for (const t of open) {
      if (t.blocked_by.includes(next) && !found.has(t.id)) {
        found.add(t.id);
        queue.push(t.id);
      }
    }
  }

  return [...found];
}

/** Whether the owner may cancel the ticket: it is unfinished and its card (if any) is open. */
export function canCancelTicket(
  ticket: { readonly status: TicketStatus },
  card: { readonly closed_reason?: string | undefined } | null,
): boolean {
  return !TERMINAL_STATUSES.includes(ticket.status) && card?.closed_reason === undefined;
}
