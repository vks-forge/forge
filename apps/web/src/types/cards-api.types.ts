/**
 * The cards resource of the ForgeApi port.
 *
 * Why: the Board's Cards view and the Card page read and change cards through the real
 *   server (d-0123). Naming the calls once lets the http adapter, the hooks and the tests agree
 *   on them, and keeps `type`, `closed_reason` and a chat message as the only things the UI
 *   can write, as the server allows (the column is never patched, d-0107).
 *
 * Exports: CardsApi, CardListParams, CardEventsParams, CardHistory.
 * Depends on: @forge/core (types), schemas/cards, types/api.types (types only).
 */

import type { CardColumn, CardType, CardTypeName } from '@forge/core';
import type {
  CardDetailReply,
  CardHistoryEvent,
  CardHistoryPage,
  CardListReply,
  CardMessageReply,
} from '#/schemas/cards.js';
import type { RequestOptions } from '#/types/api.types.js';

export interface CardListParams {
  readonly slug: string;
  readonly column?: CardColumn;
  readonly type?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

/** Windows of the history by `seq` (exclusive bounds); see `GET /cards/:id/events`. */
export interface CardEventsParams {
  /** Events after this `seq`, oldest first: the poll. */
  readonly after?: number;
  /** Events before this `seq`, newest first: "load older". */
  readonly before?: number;
  /** `desc` with no bound is the newest page. */
  readonly order?: 'asc' | 'desc';
  readonly limit?: number;
}

/** The part of a card's history the page holds, oldest first, deduplicated by `seq`. */
export interface CardHistory {
  readonly events: readonly CardHistoryEvent[];
  /** True while events older than the oldest one held may exist. */
  readonly hasOlder: boolean;
}

export interface CardsApi {
  list(params: CardListParams, options?: RequestOptions): Promise<CardListReply>;
  get(id: string, options?: RequestOptions): Promise<CardDetailReply>;
  /** One window of history; the order follows the params, items always carry `seq`. */
  events(
    id: string,
    params: CardEventsParams,
    options?: RequestOptions,
  ): Promise<CardHistoryPage>;
  types(options?: RequestOptions): Promise<readonly CardType[]>;
  /** Changes the type, or closes the card with a reason; returns the card as it now is. */
  patch(
    id: string,
    body: { type?: CardTypeName; closed_reason?: string },
  ): Promise<CardDetailReply>;
  /** Sends a chat message to the card's Director; its reply arrives later as an event. */
  send(id: string, text: string, author: string): Promise<CardMessageReply>;
}
