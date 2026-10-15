/**
 * Shapes the project ticket list is filtered and paged by.
 *
 * Why: the Board asks storage for one project's tickets a page at a time. Page `n+1` must
 *   start exactly after the last ticket of page `n` even while tickets change, so storage
 *   takes the last row's sort key rather than an offset. Both storage adapters and the
 *   server's cursor share these shapes so they cannot disagree on the order.
 *
 * Exports: TicketListKey, TicketListFilter.
 * Depends on: schemas/ids, schemas/ticket. Types only.
 */

import type { TicketId } from '#/schemas/ids.js';
import type { TicketStatus } from '#/schemas/ticket.js';

/** Position in a project's ticket list: the last row already shown. */
export interface TicketListKey {
  readonly updated_at: string;
  readonly id: TicketId;
}

/** What `TicketRepository.listByProject` filters and pages by. */
export interface TicketListFilter {
  readonly statuses?: readonly TicketStatus[];
  readonly limit: number;
  readonly after?: TicketListKey;
}
