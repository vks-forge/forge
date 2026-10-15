/**
 * Response schemas for the card endpoints, as the web app reads them.
 *
 * Why: the Board and the Card page show what the server says about requests (cards) and the
 *   Director's conversation about them. Rows come from core's own schemas so a column added
 *   there reaches the UI with no edit here. Two things are deliberately looser than core: a
 *   history event's `kind` is any string, because the card Director is still growing new
 *   event kinds (`director_action` and others) and an old UI must show an unknown kind as a
 *   neutral note instead of failing the whole history; and the card's `director` block (is the
 *   Director thinking or in error?) is optional and ignored when malformed, so a server that
 *   does not send it yet, or sends a state this UI does not know, never breaks the page.
 *
 * Exports: CardListReply, CardDetailReply, CardTypesReply, CardHistoryEvent, CardHistoryPage,
 *   CardMessageReply, DirectorBlock (schemas and inferred types).
 * Depends on: @forge/core (CardSummary, CardDetail, CardType), zod.
 */

import { CardDetail, CardSummary, CardType } from '@forge/core';
import { z } from 'zod';

export const CardListReply = z.object({
  items: z.array(CardSummary),
  nextCursor: z.string().min(1).nullable(),
});
export type CardListReply = z.infer<typeof CardListReply>;

export const DirectorBlock = z.object({
  state: z.enum(['idle', 'thinking', 'error']),
  last_error: z.string().optional(),
});
export type DirectorBlock = z.infer<typeof DirectorBlock>;

export const CardDetailReply = CardDetail.extend({
  director: DirectorBlock.optional().catch(undefined),
});
export type CardDetailReply = z.infer<typeof CardDetailReply>;

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
