/**
 * Response schemas for the card endpoints, as the web app reads them.
 *
 * Why: the Board and the Card page show what the server says about requests (cards) and the
 *   Director's conversation about them. Rows start from core's schemas so a column added
 *   there reaches the UI with no edit here, then this file adds what the card-first flow
 *   needs on top: the phase and its `needs_you` overlay, the priority, links, and the two
 *   dependency lists. Every one of those has a default, so a UI newer than its server still
 *   draws a card (no dependencies, normal priority) instead of failing the whole list; the
 *   phase alone stays optional because a made-up one would put a wrong label on the card.
 *   The column set is the web's own: the server rolls the column up (d-0139), and an older
 *   server's `new` is shown as `shaping`, since the Director now starts work at once.
 *   One thing is deliberately looser than core: a history event's `kind` is any string,
 *   because the card Director is still growing new event kinds and an old UI must show an
 *   unknown kind as a neutral note instead of failing the whole history. The card's
 *   `director` status (idle, thinking, error) is part of the card detail and always present.
 *
 * Exports: CardColumn, CardPhase, CardPriority, CardSummary, CardDetailReply, CardListReply,
 *   CardCreateReply, CardTypesReply, CardHistoryEvent, CardHistoryPage, CardMessageReply
 *   (schemas and inferred types), CARD_COLUMNS.
 * Depends on: @forge/core (CardSummary, CardDetail, CardType), zod.
 */

import {
  CardDetail as CoreCardDetail,
  CardSummary as CoreCardSummary,
  CardType,
} from '@forge/core';
import { z } from 'zod';

export const CARD_COLUMNS = [
  'shaping',
  'needs_you',
  'queued',
  'in_progress',
  'done',
  'closed',
] as const;
export const CardColumn = z.preprocess(
  (value) => (value === 'new' ? 'shaping' : value),
  z.enum(CARD_COLUMNS),
);
export type CardColumn = z.infer<typeof CardColumn>;

export const CardPhase = z.enum([
  'grilling',
  'verifying',
  'plan_ready',
  'approved',
  'queued',
  'in_progress',
  'done',
  'closed',
]);
export type CardPhase = z.infer<typeof CardPhase>;

export const CardPriority = z.enum(['low', 'normal', 'high', 'urgent']);
export type CardPriority = z.infer<typeof CardPriority>;

/** What the card flow adds to every card read; each field has a default for an older server. */
const FlowFields = {
  column: CardColumn,
  phase: CardPhase.optional(),
  needs_you: z.boolean().default(false),
  phase_version: z.number().int().nonnegative().default(0),
  priority: CardPriority.default('normal'),
  links: z.array(z.string()).default([]),
  depends_on: z.array(z.string()).default([]),
  blocks: z.array(z.string()).default([]),
  // An older server omits them and the current one sends null before any grill or plan; both
  // read as absent, so the card face drops that part of the phase line rather than inventing a
  // number.
  open_points: z
    .number()
    .int()
    .nonnegative()
    .nullish()
    .transform((v) => v ?? undefined)
    .optional(),
  plan_version: z
    .number()
    .int()
    .positive()
    .nullish()
    .transform((v) => v ?? undefined)
    .optional(),
};

export const CardSummary = CoreCardSummary.extend(FlowFields);
export type CardSummary = z.infer<typeof CardSummary>;

export const CardListReply = z.object({
  items: z.array(CardSummary),
  nextCursor: z.string().min(1).nullable(),
});
export type CardListReply = z.infer<typeof CardListReply>;

/** `GET /cards/:id` and the `PATCH` answer: the card with its tickets and `director` status. */
export const CardDetailReply = CoreCardDetail.extend(FlowFields);
export type CardDetailReply = z.infer<typeof CardDetailReply>;

/** `POST /projects/:slug/cards` (201, or 200 for a repeated `dedupe_key`) and `PUT /cards/:id/relations`. */
export const CardCreateReply = z.object({ card: CardSummary });
export type CardCreateReply = z.infer<typeof CardCreateReply>;

export const CardTypesReply = z.object({ types: z.array(CardType) });
export type CardTypesReply = z.infer<typeof CardTypesReply>;

/** One history event with an open `kind`; `payload` is read field by field, never trusted. */
export const CardHistoryEvent = z.object({
  seq: z.number().int().nonnegative(),
  kind: z.string().min(1),
  at: z.iso.datetime(),
  actor: z.object({ type: z.string(), id: z.string() }),
  payload: z.record(z.string(), z.unknown()).catch({}),
});
export type CardHistoryEvent = z.infer<typeof CardHistoryEvent>;

export const CardHistoryPage = z.object({
  items: z.array(CardHistoryEvent),
  nextCursor: z.string().min(1).nullable(),
});
export type CardHistoryPage = z.infer<typeof CardHistoryPage>;

/** `POST /cards/:id/messages` answers 202 with the stored `user_message` event. */
export const CardMessageReply = z.object({ event: CardHistoryEvent });
export type CardMessageReply = z.infer<typeof CardMessageReply>;
