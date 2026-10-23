/**
 * `GET /tickets/:id/history` and `GET /cards/:id/history`: what a ticket or card went through.
 *
 * Why: the owner sees work move between Planned, In progress, Needs you, Review and Done and asks
 *   "what happened, and why?". These two reads return one ordered list of plain-language entries
 *   (core `HistoryEntry`), merged on the server from events, questions, runs, reviews and checks so
 *   every client shows the same story. A card's list holds its own phases plus one roll-up line
 *   per ticket event, each carrying the ticket id so the page links to that ticket's history.
 *   The list is paged by time: `limit` newest entries before `before`, oldest first, with
 *   `next_before` as the cursor for older ones. Live refresh needs no new stream: the project
 *   stream's invalidate-only events already tell the page to refetch (d-0132).
 *
 * Exports: historyRoutes().
 * Depends on: @forge/core (CardId, TicketId, HistoryQuery, HistoryPage, pageHistory), services/history-source,
 *   services/http/http-errors, services/http/respond, types/routes. IO: reads storage.
 */

import { CardId, HistoryPage, HistoryQuery, TicketId, pageHistory } from '@forge/core';
import { loadCardHistory, loadTicketHistory } from '#/services/history-source.js';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

function queryOf(url: URL): HistoryQuery {
  const parsed = HistoryQuery.safeParse({
    before: url.searchParams.get('before') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });

  if (!parsed.success) {
    throw HttpError.fromZod(parsed.error);
  }

  return parsed.data;
}

const pageOf = (
  entries: Parameters<typeof pageHistory>[0],
  query: HistoryQuery,
): HistoryPage =>
  HistoryPage.parse(
    pageHistory(entries, {
      ...(query.before === undefined ? {} : { before: query.before }),
      ...(query.limit === undefined ? {} : { limit: query.limit }),
    }),
  );

export function historyRoutes(deps: RouteDeps): Route[] {
  const ticket: Route = {
    method: 'GET',
    path: '/tickets/:id/history',
    async handle({ res, params, url }) {
      const id = TicketId.safeParse(params['id']);
      if (!id.success) {
        throw new HttpError(400, 'invalid_ticket_id', 'ticket id must look like FG-12');
      }

      const query = queryOf(url);
      const entries = await deps.storage.transaction((tx) =>
        loadTicketHistory(tx, id.data),
      );

      if (!entries) {
        throw new HttpError(404, 'ticket_not_found', `no ticket ${id.data}`);
      }

      sendJson(res, 200, pageOf(entries, query));
    },
  };

  const card: Route = {
    method: 'GET',
    path: '/cards/:id/history',
    async handle({ res, params, url }) {
      const id = CardId.safeParse(params['id']);
      if (!id.success) {
        throw new HttpError(400, 'invalid_card_id', 'card id must look like FG-C12');
      }

      const query = queryOf(url);
      const entries = await deps.storage.transaction((tx) =>
        loadCardHistory(tx, id.data),
      );

      if (!entries) {
        throw new HttpError(404, 'card_not_found', `no card ${id.data}`);
      }

      sendJson(res, 200, pageOf(entries, query));
    },
  };

  return [ticket, card];
}
