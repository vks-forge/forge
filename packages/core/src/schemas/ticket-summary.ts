/**
 * Ticket list schemas — the board card, the list query and one page of results.
 *
 * Why: the web Board shows every ticket of a project as a card in a status column. Fetching
 *   each full ticket (runs, gates, interactions) for that would be one request per card, so
 *   the list carries only what a card shows: where the ticket is, its lane, whether a
 *   person must act (`needs_you`, derived from the status so the UI cannot disagree with the
 *   state machine) and the status of the run working on it. The query is defined here, next
 *   to the row it filters, so the server route and the storage port agree on the allowed
 *   statuses and the page size cap (a board never asks for the whole table).
 *
 * Exports: TicketSummary, TicketListQuery, TicketListPage, TICKET_LIST_DEFAULT_LIMIT,
 *   TICKET_LIST_MAX_LIMIT, NEEDS_YOU_STATUSES.
 * Depends on: schemas/ids, schemas/run, schemas/ticket, zod. No IO.
 */

import { z } from 'zod';
import { TicketId } from '#/schemas/ids.js';
import { RunStatus } from '#/schemas/run.js';
import { Lane, Tier, TicketStatus, TicketType } from '#/schemas/ticket.js';

export const TICKET_LIST_DEFAULT_LIMIT = 100;
export const TICKET_LIST_MAX_LIMIT = 500;

/** Statuses where the ticket waits on a person (a question, a review, a tier-C sign-off). */
export const NEEDS_YOU_STATUSES: readonly TicketStatus[] = [
  'waiting_human',
  'review',
  'needs_signoff',
];

/** One board card. `state` is the ticket's status; `project` is the project slug. */
export const TicketSummary = z.object({
  id: TicketId,
  title: z.string().min(1),
  state: TicketStatus,
  lane: Lane,
  type: TicketType,
  tier_predicted: Tier,
  project: z.string().min(1),
  priority: z.number().int(),
  rework_count: z.number().int().nonnegative(),
  needs_you: z.boolean(),
  blocked_reason: z.string().optional(),
  /** The run working on the ticket now, when there is one, with its persisted status. */
  run_id: z.string().min(1).optional(),
  run_status: RunStatus.optional(),
  pr_url: z.string().min(1).optional(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});
export type TicketSummary = z.infer<typeof TicketSummary>;

/**
 * `GET /projects/:slug/tickets` parameters after the route has split repeated and
 * comma-separated `state` values. Strings are coerced because they come from a URL.
 */
export const TicketListQuery = z.object({
  state: z.array(TicketStatus).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(TICKET_LIST_MAX_LIMIT)
    .default(TICKET_LIST_DEFAULT_LIMIT),
  cursor: z.string().min(1).optional(),
});
export type TicketListQuery = z.infer<typeof TicketListQuery>;

/** One page of the list; `next_cursor` is null on the last page. */
export const TicketListPage = z.object({
  items: z.array(TicketSummary),
  nextCursor: z.string().min(1).nullable(),
});
export type TicketListPage = z.infer<typeof TicketListPage>;
