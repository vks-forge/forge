/**
 * Types of the Tickets table: its API port and component props.
 *
 * Why: the screen reads the server's paged ticket list through one port, so the endpoint
 *   shape lives in one adapter, and its parts (filters, table, pager) are given exactly the
 *   state they draw and the callbacks that change it.
 *
 * Exports: TicketsTableApi, TicketsFiltersProps, TicketsTableViewProps, TicketsPagerProps.
 * Depends on: schemas/tickets-table, types/api.types. Types only.
 */

import type {
  TicketRow,
  TicketSortKey,
  TicketsTablePage,
  TicketsTableParams,
} from '#/schemas/tickets-table.js';
import type { RequestOptions } from '#/types/api.types.js';

export interface TicketsTableApi {
  /** One page of a project's tickets, filtered and sorted on the server, with the total. */
  list(
    slug: string,
    params: TicketsTableParams,
    options?: RequestOptions,
  ): Promise<TicketsTablePage>;
}

export interface TicketsFiltersProps {
  readonly params: TicketsTableParams;
  readonly onChange: (patch: Partial<TicketsTableParams>) => void;
  readonly onClear: () => void;
  readonly filtered: boolean;
}

export interface TicketsTableViewProps {
  readonly slug: string;
  /** Null draws skeleton rows. */
  readonly rows: readonly TicketRow[] | null;
  readonly params: TicketsTableParams;
  readonly stale: boolean;
  readonly onSort: (key: TicketSortKey) => void;
}

export interface TicketsPagerProps {
  readonly params: TicketsTableParams;
  readonly total: number;
  readonly onChange: (patch: Partial<TicketsTableParams>) => void;
}
