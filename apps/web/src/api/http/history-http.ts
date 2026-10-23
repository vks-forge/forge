/**
 * The `http` side of the history resource.
 *
 * Why: this is the only place that knows the history paths (`/tickets/:id/history`,
 *   `/cards/:id/history`) and their `before` / `limit` query. Every answer is parsed with the
 *   core `HistoryPage` schema, so an entry the server shaped wrongly fails loudly here instead
 *   of drawing a half-empty row.
 *
 * Exports: createHistoryHttp().
 * Depends on: @forge/core (HistoryPage), api/http/request-json, types/api.types, types/history-api.types.
 */

import { HistoryPage } from '@forge/core';
import { requestJson } from '#/api/http/request-json.js';
import type { HttpClientOptions } from '#/types/api.types.js';
import type { HistoryApi, HistoryParams } from '#/types/history-api.types.js';

const enc = encodeURIComponent;

function query(params: HistoryParams | undefined): string {
  const search = new URLSearchParams();
  if (params?.before !== undefined) {
    search.set('before', params.before);
  }

  if (params?.limit !== undefined) {
    search.set('limit', String(params.limit));
  }

  const text = search.toString();

  return text === '' ? '' : `?${text}`;
}

export function createHistoryHttp(client: HttpClientOptions): HistoryApi {
  return {
    ticket: (id, params, options) =>
      requestJson(
        client,
        `/tickets/${enc(id)}/history${query(params)}`,
        HistoryPage,
        options,
      ),
    card: (id, params, options) =>
      requestJson(
        client,
        `/cards/${enc(id)}/history${query(params)}`,
        HistoryPage,
        options,
      ),
  };
}
