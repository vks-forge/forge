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
 *   The row also carries the live facts a tile shows without opening the ticket: the pipeline stage it is
 *   at (`stage`: position, count, label), the run working on it right now (`live_run`: its number among
 *   the ticket's runs, the agent, when it started, so the web ticks the elapsed clock itself) and, for a
 *   ticket parked on an owner question that offers Retry, that question's id (`retry_escalation_id`).
 *   The server computes them for the whole page at once, so a board never asks per tile.
 *
 * Exports: TicketStageProgress, TicketLiveRun, TicketSummary, TicketListQuery, TicketListPage, TicketSort, TICKET_LIST_DEFAULT_LIMIT,
 *   TICKET_LIST_MAX_LIMIT, NEEDS_YOU_STATUSES.
 * Depends on: schemas/ids, schemas/run, schemas/ticket, schemas/ticket-wait, zod. No IO.
 */

import { z } from 'zod';
import { CardId, TicketId } from '#/schemas/ids.js';
import { RunStatus } from '#/schemas/run.js';
import { Lane, Tier, TicketStatus, TicketType } from '#/schemas/ticket.js';
import { TicketWait } from '#/schemas/ticket-wait.js';

export const TICKET_LIST_DEFAULT_LIMIT = 100;
export const TICKET_LIST_MAX_LIMIT = 500;

/** Statuses where the ticket may wait on a person (a question, a question that timed out, a review, a tier-C sign-off); a `waiting_human` ticket counts only while an owner item is open (see `derivePhase`). */
export const NEEDS_YOU_STATUSES: readonly TicketStatus[] = [
  'waiting_human',
  'blocked',
  'review',
  'needs_signoff',
];

/** Where a ticket is in its own pipeline copy: stage `index` of `count` (1-based) and its label. */
export const TicketStageProgress = z.object({
  index: z.number().int().positive(),
  count: z.number().int().positive(),
  label: z.string().min(1),
});
export type TicketStageProgress = z.infer<typeof TicketStageProgress>;

/** The run working on a ticket now: `number` is its place among the ticket's runs (run 2 is the second). */
export const TicketLiveRun = z.object({
  number: z.number().int().positive(),
  agent: z.string().min(1).optional(),
  started_at: z.iso.datetime(),
});
export type TicketLiveRun = z.infer<typeof TicketLiveRun>;

/** One board card. `state` is the ticket's status; `project` is the project slug. */
export const TicketSummary = z.object({
  id: TicketId,
  title: z.string().min(1),
  state: TicketStatus,
  lane: Lane,
  type: TicketType,
  tier_predicted: Tier,
  project: z.string().min(1),
  /** The parent card, so a Board ticket card can link back to it (d-0105). */
  card_id: CardId.optional(),
  priority: z.number().int(),
  rework_count: z.number().int().nonnegative(),
  needs_you: z.boolean(),
  /** The phase the ticket is really in and why (absent from older servers). */
  wait: TicketWait.optional(),
  blocked_reason: z.string().optional(),
  /** The run working on the ticket now, when there is one, with its persisted status. */
  run_id: z.string().min(1).optional(),
  run_status: RunStatus.optional(),
  /** The stage of its pipeline the ticket is at; absent before its first dispatch and once it is done or cancelled. */
  stage: TicketStageProgress.optional(),
  /** The run in flight now; absent when nothing is running. */
  live_run: TicketLiveRun.optional(),
  /** The owner question that offers Retry for this ticket, so a tile can retry in one click. */
  retry_escalation_id: z.string().min(1).optional(),
  pr_url: z.string().min(1).optional(),
  /** Title of the parent card (list rows only). */
  card_title: z.string().optional(),
  /** Recorded run cost of this ticket in dollars; runs that recorded none count as 0. The server always sets it. */
  cost_usd: z.number().nonnegative().optional(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});
export type TicketSummary = z.infer<typeof TicketSummary>;

/**
 * `GET /projects/:slug/tickets` parameters after the route has split repeated and
 * comma-separated `state` values. Strings are coerced because they come from a URL.
 */
export const TicketSort = z.enum(['updated', 'created', 'cost']);
export type TicketSort = z.infer<typeof TicketSort>;

export const TicketListQuery = z.object({
  state: z.array(TicketStatus).optional(),
  lane: Lane.optional(),
  /** Only the tickets of this card. */
  card: CardId.optional(),
  /** Case-insensitive match on the ticket id or title. */
  q: z.string().trim().min(1).max(100).optional(),
  /** Newest first by `updated_at` (default), `created_at`, or highest recorded cost first. */
  sort: TicketSort.default('updated'),
  /** Rows to skip. Works with every sort; the cursor only continues the default sort. */
  offset: z.coerce.number().int().min(0).optional(),
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
  /** Tickets matching the filters, whatever the page (absent from older servers). */
  total: z.number().int().nonnegative().optional(),
  nextCursor: z.string().min(1).nullable(),
});
export type TicketListPage = z.infer<typeof TicketListPage>;
