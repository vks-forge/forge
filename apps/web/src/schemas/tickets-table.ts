/**
 * Schemas of the Tickets table: one row, one page, and the filter/sort/page state in the URL.
 *
 * Why: the Tickets screen lists every ticket of a project with its cost, so the server pages,
 *   filters and sorts and the UI only asks. The page is parsed at the boundary so a renamed
 *   field fails with its name, not as a blank cell; `cost_usd` is optional because a ticket
 *   whose runs reported no cost has none to show (the UI prints a dash, never $0.00). The
 *   table state (`TicketsTableParams`) is what the URL holds: every part has a default, so
 *   a hand-edited or stale link with an invalid value falls back instead of breaking the page.
 *
 * Exports: TicketRow, TicketsTablePage, TicketsTableParams, TicketSortKey, TICKETS_PAGE_SIZES, TICKETS_DEFAULT_SIZE (schemas and inferred types).
 * Depends on: @forge/core (TicketSummary, TicketStatus, Lane), zod.
 */

import { Lane, TicketSort, TicketStatus, TicketSummary } from '@forge/core';
import { z } from 'zod';

export const TicketRow = TicketSummary.extend({
  /** Total cost of the ticket's runs in USD; absent when no run reported a cost. */
  cost_usd: z.number().nonnegative().nullish(),
});
export type TicketRow = z.infer<typeof TicketRow>;

export const TicketsTablePage = z.object({
  items: z.array(TicketRow),
  /** Tickets matching the filters, across all pages. */
  total: z.number().int().nonnegative(),
});
export type TicketsTablePage = z.infer<typeof TicketsTablePage>;

/** What the server can order by; every order is newest or highest first. */
export const TicketSortKey = TicketSort;
export type TicketSortKey = z.infer<typeof TicketSortKey>;

export const TICKETS_PAGE_SIZES = [10, 25, 50] as const;
export const TICKETS_DEFAULT_SIZE = 25;

export const TicketsTableParams = z.object({
  states: z.array(TicketStatus),
  lane: Lane.nullable(),
  q: z.string(),
  sort: TicketSortKey,
  /** One-based. */
  page: z.number().int().min(1),
  size: z
    .number()
    .int()
    .refine((n) => (TICKETS_PAGE_SIZES as readonly number[]).includes(n)),
});
export type TicketsTableParams = z.infer<typeof TicketsTableParams>;
