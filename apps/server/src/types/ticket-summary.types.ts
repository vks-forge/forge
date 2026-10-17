/**
 * Optional facts a route adds to a ticket summary from its own reads.
 *
 * Why: the ticket list and the card page both describe a ticket the same way
 *   (`summarizeTicket`), but only some callers have read the ticket's run cost or its card's
 *   title. Naming the extras keeps the summary builder pure and the callers honest about what
 *   they read.
 *
 * Exports: TicketExtras.
 * Depends on: none. Types only.
 */

export interface TicketExtras {
  /** Recorded run cost of the ticket in dollars. */
  readonly costUsd?: number;
  /** Title of the ticket's card. */
  readonly cardTitle?: string;
}
