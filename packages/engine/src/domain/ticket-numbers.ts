/**
 * Ticket number allocation.
 *
 * Why: ticket ids are the database primary key and appear in branches and receipts
 *   (d-0055); a duplicate or reused number would merge two tickets' histories. The next
 *   number is derived from the ids that exist, inside the intake transaction, so there is
 *   no counter to drift. Other projects' ids and malformed strings must not move it.
 *
 * Exports: nextTicketNumber(), ticketNumber().
 * Depends on: nothing. No IO.
 */

/** Max + 1 over ids `<prefix>-<n>`; 1 when there are none. Gaps are not reused. */
export function nextTicketNumber(ids: readonly string[], prefix: string): number {
  const lead = `${prefix}-`;
  let max = 0;
  for (const id of ids) {
    if (!id.startsWith(lead)) continue;
    const rest = id.slice(lead.length);
    if (!/^[1-9][0-9]*$/.test(rest)) continue;
    max = Math.max(max, Number(rest));
  }
  return max + 1;
}

/** The numeric part of a `<PROJECT>-<n>` id, for oldest-first ordering. */
export function ticketNumber(id: string): number {
  return Number(id.slice(id.lastIndexOf('-') + 1));
}
