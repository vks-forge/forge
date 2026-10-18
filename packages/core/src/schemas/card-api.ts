/**
 * Card API schemas — list, detail, history and patch bodies for the card routes.
 *
 * Why: the Board lists cards in rolled-up columns, the Card page needs one card with its
 *   tickets and open questions, and the history is read in pages oldest first. Defining
 *   the query, the row shapes and the PATCH body next to the card means the server routes,
 *   the storage port and the web client agree on the allowed columns, the page caps and
 *   what a patch may change. A page never asks for the whole table. A patch changes only the
 *   type or closes the card; the column is never patchable (d-0107).
 *
 * Exports: CARD_LIST_DEFAULT_LIMIT, CARD_LIST_MAX_LIMIT, CARD_EVENTS_DEFAULT_LIMIT,
 *   CARD_EVENTS_MAX_LIMIT, CardSummary, CardListQuery, CardListPage, CardDetail,
 *   CardEventsQuery, CardEventsPage, CardPatchBody.
 * Depends on: schemas/card, schemas/card-chat, schemas/card-event, schemas/cost-rollup, schemas/ids, schemas/interaction, schemas/ticket-summary, zod. No IO.
 */

import { z } from 'zod';
import { Card, CardColumn, CardTypeName } from '#/schemas/card.js';
import { CardDirectorStatus } from '#/schemas/card-chat.js';
import { CardEvent } from '#/schemas/card-event.js';
import { CardCost } from '#/schemas/cost-rollup.js';
import { CardId } from '#/schemas/ids.js';
import { Interaction } from '#/schemas/interaction.js';
import { TicketSummary } from '#/schemas/ticket-summary.js';

export const CARD_LIST_DEFAULT_LIMIT = 50;
export const CARD_LIST_MAX_LIMIT = 200;

/**
 * One Board card: the row, the rolled-up column and ticket counts. `project` is the project
 * slug. `needs_you` is the effective overlay (the card's own flag, or a ticket waiting on a
 * person), not the stored flag. `depends_on` lists the cards this one waits for, `blocks`
 * the cards waiting for it (the reverse view of the same edges). `open_points` and
 * `plan_version` come from the card's planning state.
 */
export const CardSummary = Card.extend({
  column: CardColumn,
  depends_on: z.array(CardId),
  blocks: z.array(CardId),
  ticket_count: z.number().int().nonnegative(),
  tickets_done: z.number().int().nonnegative(),
  /** Points the Director still has open while it grills the card; null at any other time (d-0130). */
  open_points: z.number().int().nonnegative().nullable().default(null),
  /** The newest plan version of the card; null until a plan is written (d-0132). */
  plan_version: z.number().int().positive().nullable().default(null),
  /** Dollars the card cost so far: Director steps plus its tickets' recorded runs. The server always sets it. */
  cost_usd: z.number().nonnegative().optional(),
});
export type CardSummary = z.infer<typeof CardSummary>;

/** `GET /projects/:slug/cards` parameters; strings are coerced because they come from a URL. */
export const CardListQuery = z.object({
  column: CardColumn.optional(),
  type: CardTypeName.optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(CARD_LIST_MAX_LIMIT)
    .default(CARD_LIST_DEFAULT_LIMIT),
  cursor: z.string().min(1).optional(),
});
export type CardListQuery = z.infer<typeof CardListQuery>;

export const CardListPage = z.object({
  items: z.array(CardSummary),
  nextCursor: z.string().min(1).nullable(),
});
export type CardListPage = z.infer<typeof CardListPage>;

/** `GET /cards/:id`: the card, its rolled-up column, linked tickets, the questions waiting on the user and whether the Director is answering a chat message. */
export const CardDetail = CardSummary.extend({
  tickets: z.array(TicketSummary),
  pending_interactions: z.array(Interaction),
  director: CardDirectorStatus,
  /** The cost split behind `cost_usd`. The server always sets it. */
  cost: CardCost.optional(),
});
export type CardDetail = z.infer<typeof CardDetail>;

export const CARD_EVENTS_DEFAULT_LIMIT = 50;
export const CARD_EVENTS_MAX_LIMIT = 200;

/**
 * `GET /cards/:id/events` parameters. `after` and `before` are event `seq` bounds (exclusive);
 * `order` is `asc` (oldest first, default) or `desc` (newest first); `before` alone implies
 * `desc`, so `?before=<oldest seq shown>&limit=N` is "load older". `cursor` is the opaque
 * continuation of the previous page and cannot be combined with `after` or `before`.
 */
export const CardEventsQuery = z.object({
  after: z.coerce.number().int().nonnegative().optional(),
  before: z.coerce.number().int().nonnegative().optional(),
  order: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(CARD_EVENTS_MAX_LIMIT)
    .default(CARD_EVENTS_DEFAULT_LIMIT),
  cursor: z.string().min(1).optional(),
});
export type CardEventsQuery = z.infer<typeof CardEventsQuery>;

/** One page of history, oldest first; `nextCursor` is null on the last page. */
export const CardEventsPage = z.object({
  items: z.array(CardEvent),
  nextCursor: z.string().min(1).nullable(),
});
export type CardEventsPage = z.infer<typeof CardEventsPage>;

/** `PATCH /cards/:id`: change the type, or close with a reason. At least one field. */
export const CardPatchBody = z
  .strictObject({
    type: CardTypeName.optional(),
    closed_reason: z.string().trim().min(1).optional(),
    /** Warning threshold in dollars (d-0143); null clears it. Never stops a card. */
    budget_cap_usd: z.number().nonnegative().nullable().optional(),
  })
  .refine(
    (b) =>
      b.type !== undefined ||
      b.closed_reason !== undefined ||
      b.budget_cap_usd !== undefined,
    {
      message:
        'give a type to change to, a closed_reason to close with, a budget_cap_usd, or a combination',
    },
  );
export type CardPatchBody = z.infer<typeof CardPatchBody>;
