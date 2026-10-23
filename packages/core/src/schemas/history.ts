/**
 * HistoryEntry — one line of a ticket's or card's history, in plain language.
 *
 * Why: the owner sees a card or ticket move between Planned, In progress, Needs you, Review and Done
 *   and cannot tell what it went through or why. The facts live in six places (card events,
 *   interactions, runs, stage runs, wakes, gate results); the History tab must not make the browser
 *   merge them or invent wording. One entry shape, with the actor, a title already written for a
 *   reader who does not code, and links back to the run, question or review it came from, means the
 *   server returns one ordered list and every client renders it the same way.
 *
 * Exports: HISTORY_KINDS, HistoryKind, HISTORY_ACTOR_TYPES, HistoryActor, HistoryEntry, HistoryPage,
 *   HistoryQuery, HISTORY_PAGE_DEFAULT, HISTORY_PAGE_MAX.
 * Depends on: schemas/ticket, zod. No IO.
 */

import { z } from 'zod';
import { TicketStatus } from '#/schemas/ticket.js';

export const HISTORY_KINDS = [
  'state',
  'question',
  'answer',
  'run',
  'check',
  'director',
  'setup',
  'merge',
  'plan',
  'note',
] as const;
export const HistoryKind = z.enum(HISTORY_KINDS);
export type HistoryKind = z.infer<typeof HistoryKind>;

export const HISTORY_ACTOR_TYPES = ['owner', 'director', 'engine', 'worker'] as const;

/** Who did it: the owner, the Director, Forge's own engine, or a Worker (named by its agent). */
export const HistoryActor = z.object({
  type: z.enum(HISTORY_ACTOR_TYPES),
  name: z.string().min(1).optional(),
});
export type HistoryActor = z.infer<typeof HistoryActor>;

export const HistoryEntry = z.object({
  at: z.iso.datetime(),
  kind: HistoryKind,
  actor: HistoryActor,
  title: z.string().min(1),
  /** Longer text (a review summary, an answer, a comment); clients fold it behind "Show more". */
  detail: z.string().min(1).optional(),
  from: TicketStatus.optional(),
  to: TicketStatus.optional(),
  /** The ticket the entry is about; on a card's history it links to that ticket's own history. */
  ticket_id: z.string().min(1).optional(),
  links: z.object({
    run_id: z.string().min(1).optional(),
    interaction_id: z.string().min(1).optional(),
    stage_id: z.string().min(1).optional(),
    card_id: z.string().min(1).optional(),
  }),
  /** How long the work waited before this entry (a Worker slot, an answer). */
  waited_ms: z.number().int().nonnegative().optional(),
});
export type HistoryEntry = z.infer<typeof HistoryEntry>;

export const HISTORY_PAGE_DEFAULT = 100;
export const HISTORY_PAGE_MAX = 500;

/** `GET .../history?before=<iso>&limit=<n>`: the newest `limit` entries before `before`. */
export const HistoryQuery = z.object({
  before: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(HISTORY_PAGE_MAX).optional(),
});
export type HistoryQuery = z.infer<typeof HistoryQuery>;

/** One page, oldest first; `next_before` is the cursor for the page of older entries, absent at the start. */
export const HistoryPage = z.object({
  entries: z.array(HistoryEntry),
  has_more: z.boolean(),
  next_before: z.iso.datetime().optional(),
});
export type HistoryPage = z.infer<typeof HistoryPage>;
