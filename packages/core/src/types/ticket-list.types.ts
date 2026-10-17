/**
 * Shapes the project ticket list is filtered, sorted and paged by.
 *
 * Why: the Board and the Tickets page ask storage for one project's tickets a page at a time.
 *   For the default order (newest change first) page `n+1` must start exactly after the last
 *   ticket of page `n` even while tickets change, so storage takes the last row's sort key
 *   rather than an offset. The Tickets page also sorts by creation time or by recorded cost
 *   and filters by lane, card and a text search; those orders have no stable key to resume
 *   from, so they page by offset and `countByProject` answers how many rows match. Both
 *   storage adapters and the server's cursor share these shapes so they cannot disagree on
 *   the order.
 *
 * Exports: TicketListKey, TicketMatch, TicketListFilter.
 * Depends on: schemas/ids, schemas/ticket, schemas/ticket-summary. Types only.
 */

import type { CardId, TicketId } from '#/schemas/ids.js';
import type { Lane, TicketStatus } from '#/schemas/ticket.js';
import type { TicketSort } from '#/schemas/ticket-summary.js';

/** Position in a project's ticket list: the last row already shown. */
export interface TicketListKey {
  readonly updated_at: string;
  readonly id: TicketId;
}

/** Which of a project's tickets match; every field narrows, none set means all. */
export interface TicketMatch {
  readonly statuses?: readonly TicketStatus[];
  readonly lane?: Lane;
  readonly card_id?: CardId;
  /** Case-insensitive substring of the ticket id or title; `%` and `_` are literal. */
  readonly search?: string;
}

/**
 * What `TicketRepository.listByProject` filters and pages by. `sort` defaults to `updated`
 * (`updated_at` desc, `id` desc), `created` is `created_at` desc then `id` desc, `cost` is
 * summed run cost desc (runs with no cost count 0) then `id` desc. `after` continues the
 * `updated` order only; `offset` skips rows in any order.
 */
export interface TicketListFilter extends TicketMatch {
  readonly limit: number;
  readonly after?: TicketListKey;
  readonly sort?: TicketSort;
  readonly offset?: number;
}
