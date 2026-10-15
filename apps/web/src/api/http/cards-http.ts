/**
 * The `http` side of the cards resource.
 *
 * Why: this is the only place that knows the card paths and how a slug, a card id, a cursor
 *   or the optional `column` and `type` filters are written into a URL. Every answer is parsed
 *   with the schemas in `schemas/cards`, so a server and UI that disagree fail here with the
 *   offending field named, while history events stay open to kinds this UI does not know yet.
 *
 * Exports: createCardsHttp().
 * Depends on: api/http/request-json, schemas/cards, types/api.types, types/cards-api.types.
 */

import { requestJson } from '#/api/http/request-json.js';
import {
  CardDetailReply,
  CardHistoryPage,
  CardListReply,
  CardMessageReply,
  CardTypesReply,
} from '#/schemas/cards.js';
import type { HttpClientOptions } from '#/types/api.types.js';
import type { CardsApi } from '#/types/cards-api.types.js';

const enc = encodeURIComponent;

/** `?a=1&b=2`, skipping undefined values. */
function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }

  const text = search.toString();

  return text === '' ? '' : `?${text}`;
}

export function createCardsHttp(client: HttpClientOptions): CardsApi {
  return {
    list: (params, options) =>
      requestJson(
        client,
        `/projects/${enc(params.slug)}/cards${query({
          column: params.column,
          type: params.type,
          cursor: params.cursor,
          limit: params.limit,
        })}`,
        CardListReply,
        options,
      ),
    get: (id, options) =>
      requestJson(client, `/cards/${enc(id)}`, CardDetailReply, options),
    events: (id, params, options) =>
      requestJson(
        client,
        `/cards/${enc(id)}/events${query({ cursor: params.cursor, limit: params.limit })}`,
        CardHistoryPage,
        options,
      ),
    types: async (options) =>
      (await requestJson(client, '/card-types', CardTypesReply, options)).types,
    patch: (id, body) =>
      requestJson(client, `/cards/${enc(id)}`, CardDetailReply, {
        method: 'PATCH',
        body,
      }),
    send: (id, text, author) =>
      requestJson(client, `/cards/${enc(id)}/messages`, CardMessageReply, {
        method: 'POST',
        body: { text, author },
      }),
  };
}
