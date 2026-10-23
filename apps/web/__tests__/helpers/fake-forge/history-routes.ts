/**
 * Stub routes for history: `GET /tickets/:id/history` and `GET /cards/:id/history`.
 *
 * Why: the History tab must show its loading, empty, paged and live states without a Forge
 *   server. Both routes page the sample entries with the same `pageHistory()` the real server
 *   uses (`before` and `limit`), so "Load earlier" walks the real cursor rules. Tests stage
 *   their own entries, a failure or a slow answer by passing a route that wins over these.
 *   Shapes match `apps/server/src/routes/history.ts`.
 *
 * Exports: historyRoutes().
 * Depends on: @forge/core (pageHistory), helpers/fetch-stub, helpers/forge-data/history-data.
 */

import { pageHistory } from '@forge/core';
import type { HistoryEntry } from '@forge/core';
import { json } from '#tests/helpers/fetch-stub.js';
import type { Routes } from '#tests/helpers/fetch-stub.js';
import {
  cardHistoryEntries,
  ticketHistoryEntries,
} from '#tests/helpers/forge-data/history-data.js';

/** A route that answers `entries` through the real paging rules. */
export function pagedHistory(entries: readonly HistoryEntry[]) {
  return ({ query }: { query: URLSearchParams }) => {
    const before = query.get('before');
    const limit = query.get('limit');

    return json(
      pageHistory(entries, {
        ...(before === null ? {} : { before }),
        ...(limit === null ? {} : { limit: Number(limit) }),
      }),
    );
  };
}

export function historyRoutes(options: { empty: boolean }): Routes {
  return {
    'GET /tickets/:id/history': pagedHistory(options.empty ? [] : ticketHistoryEntries()),
    'GET /cards/:id/history': pagedHistory(options.empty ? [] : cardHistoryEntries()),
  };
}
