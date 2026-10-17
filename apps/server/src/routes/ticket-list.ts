/**
 * `GET /projects/:slug/tickets`: one project's tickets as board cards, newest change first.
 *
 * Why: the web Board draws every ticket of a project in a column per status. Calling
 *   `GET /tickets/:id` per card would be one round trip (and four table reads) each, so this
 *   returns the light `TicketSummary` of many tickets at once. `state` (repeatable or comma
 *   separated) lets a column ask for its own statuses; paging is by an opaque cursor over
 *   (`updated_at`, `id`) so a ticket that moves while the user scrolls cannot show twice or
 *   vanish. A slug that is not a registered project is 404 (not an empty board), and any bad
 *   parameter is a 400 listing the fields. Archived projects are still listed: their history
 *   stays readable.
 *
 *   The same route feeds the Tickets page: `lane`, `card` and `q` (id or title) narrow the
 *   list, `sort` is `updated` (default), `created` or `cost`, and `offset` pages every order.
 *   Sorting by cost or creation has no stable key to resume from, so those pages (and any
 *   page with `offset`) carry `total` but no cursor; a cursor with `offset` or another sort
 *   is a 400. Every row carries its recorded run cost (one grouped read for the page, not a
 *   query per ticket) and its card's title.
 *
 * Exports: ticketListRoute().
 * Depends on: @forge/core (TicketListQuery), services/ticket-cursor, services/ticket-summary,
 *   services/http/http-errors, services/http/respond, types/routes. IO: reads storage.
 */

import { TicketListQuery } from '@forge/core';
import type { CardId, TicketListPage, TicketMatch, TicketSummary } from '@forge/core';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import { decodeTicketCursor, encodeTicketCursor } from '#/services/ticket-cursor.js';
import { summarizeTicket } from '#/services/ticket-summary.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

/** `?state=a&state=b,c` becomes `['a','b','c']`; absent stays undefined. */
function statesOf(params: URLSearchParams): string[] | undefined {
  const given = params.getAll('state');

  return given.length === 0 ? undefined : given.flatMap((v) => v.split(','));
}

export function ticketListRoute(deps: RouteDeps): Route {
  return {
    method: 'GET',
    path: '/projects/:slug/tickets',
    async handle({ res, params, url }) {
      const slug = params['slug'] ?? '';
      const parsed = TicketListQuery.safeParse({
        state: statesOf(url.searchParams),
        lane: url.searchParams.get('lane') ?? undefined,
        card: url.searchParams.get('card') ?? undefined,
        q: url.searchParams.get('q') ?? undefined,
        sort: url.searchParams.get('sort') ?? undefined,
        offset: url.searchParams.get('offset') ?? undefined,
        limit: url.searchParams.get('limit') ?? undefined,
        cursor: url.searchParams.get('cursor') ?? undefined,
      });

      if (!parsed.success) {
        throw HttpError.fromZod(parsed.error);
      }

      const query = parsed.data;
      const byCursor = query.sort === 'updated' && query.offset === undefined;
      if (query.cursor !== undefined && !byCursor) {
        throw new HttpError(
          400,
          'invalid_query',
          'cursor only continues the default sort and cannot be combined with offset',
        );
      }

      const after =
        query.cursor === undefined ? undefined : decodeTicketCursor(query.cursor);

      if (after === null) {
        throw new HttpError(
          400,
          'invalid_cursor',
          'cursor is not one this server issued',
        );
      }

      const match: TicketMatch = {
        ...(query.state ? { statuses: query.state } : {}),
        ...(query.lane ? { lane: query.lane } : {}),
        ...(query.card ? { card_id: query.card } : {}),
        ...(query.q ? { search: query.q } : {}),
      };

      const page = await deps.storage.transaction(async (tx) => {
        const project = (await tx.projects.list()).find((p) => p.slug === slug);
        if (!project) {
          return null;
        }

        // One extra row tells whether another page exists without a second query.
        const rows = await tx.tickets.listByProject(project.id, {
          ...match,
          sort: query.sort,
          limit: query.limit + 1,
          ...(query.offset === undefined ? {} : { offset: query.offset }),
          ...(after ? { after } : {}),
        });

        const shown = rows.slice(0, query.limit);
        const costs = await tx.runs.costByTicket(shown.map((t) => t.id));
        const titles = new Map<CardId, string>();
        for (const id of new Set(shown.flatMap((t) => (t.card_id ? [t.card_id] : [])))) {
          const card = await tx.cards.get(id);
          if (card) {
            titles.set(id, card.title);
          }
        }

        const items: TicketSummary[] = [];
        for (const ticket of shown) {
          const run = ticket.assignee_run_id
            ? await tx.runs.get(ticket.assignee_run_id)
            : null;

          const cardTitle = ticket.card_id ? titles.get(ticket.card_id) : undefined;
          items.push(
            summarizeTicket(ticket, slug, run?.status, {
              costUsd: costs[ticket.id] ?? 0,
              ...(cardTitle === undefined ? {} : { cardTitle }),
            }),
          );
        }

        const last = shown[shown.length - 1];
        const body: TicketListPage = {
          items,
          total: await tx.tickets.countByProject(project.id, match),
          nextCursor:
            byCursor && rows.length > query.limit && last
              ? encodeTicketCursor({ updated_at: last.updated_at, id: last.id })
              : null,
        };

        return body;
      });

      if (!page) {
        throw new HttpError(404, 'project_not_found', `no project ${slug}`);
      }

      sendJson(res, 200, page);
    },
  };
}
