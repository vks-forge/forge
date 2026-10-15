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
 * Exports: ticketListRoute().
 * Depends on: @forge/core (TicketListQuery, NEEDS_YOU_STATUSES), services/ticket-cursor,
 *   services/http/http-errors, services/http/respond, types/routes. IO: reads storage.
 */

import { NEEDS_YOU_STATUSES, TicketListQuery } from '@forge/core';
import type { Ticket, TicketListPage, TicketSummary } from '@forge/core';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import { decodeTicketCursor, encodeTicketCursor } from '#/services/ticket-cursor.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

/** `?state=a&state=b,c` becomes `['a','b','c']`; absent stays undefined. */
function statesOf(params: URLSearchParams): string[] | undefined {
  const given = params.getAll('state');

  return given.length === 0 ? undefined : given.flatMap((v) => v.split(','));
}

function summarize(
  ticket: Ticket,
  slug: string,
  runStatus: TicketSummary['run_status'],
): TicketSummary {
  return {
    id: ticket.id,
    title: ticket.title,
    state: ticket.status,
    lane: ticket.lane,
    type: ticket.type,
    tier_predicted: ticket.tier_predicted,
    project: slug,
    priority: ticket.priority,
    rework_count: ticket.rework_count,
    needs_you: NEEDS_YOU_STATUSES.includes(ticket.status),
    ...(ticket.blocked_reason === undefined
      ? {}
      : { blocked_reason: ticket.blocked_reason }),
    ...(ticket.assignee_run_id === undefined ? {} : { run_id: ticket.assignee_run_id }),
    ...(runStatus === undefined ? {} : { run_status: runStatus }),
    ...(ticket.pr_url === undefined ? {} : { pr_url: ticket.pr_url }),
    created_at: ticket.created_at,
    updated_at: ticket.updated_at,
  };
}

export function ticketListRoute(deps: RouteDeps): Route {
  return {
    method: 'GET',
    path: '/projects/:slug/tickets',
    async handle({ res, params, url }) {
      const slug = params['slug'] ?? '';
      const parsed = TicketListQuery.safeParse({
        state: statesOf(url.searchParams),
        limit: url.searchParams.get('limit') ?? undefined,
        cursor: url.searchParams.get('cursor') ?? undefined,
      });

      if (!parsed.success) {
        throw HttpError.fromZod(parsed.error);
      }

      const query = parsed.data;
      const after =
        query.cursor === undefined ? undefined : decodeTicketCursor(query.cursor);

      if (after === null) {
        throw new HttpError(
          400,
          'invalid_cursor',
          'cursor is not one this server issued',
        );
      }

      const page = await deps.storage.transaction(async (tx) => {
        const project = (await tx.projects.list()).find((p) => p.slug === slug);
        if (!project) {
          return null;
        }

        // One extra row tells whether another page exists without a second query.
        const rows = await tx.tickets.listByProject(project.id, {
          ...(query.state ? { statuses: query.state } : {}),
          limit: query.limit + 1,
          ...(after ? { after } : {}),
        });

        const shown = rows.slice(0, query.limit);
        const items: TicketSummary[] = [];
        for (const ticket of shown) {
          const run = ticket.assignee_run_id
            ? await tx.runs.get(ticket.assignee_run_id)
            : null;

          items.push(summarize(ticket, slug, run?.status));
        }

        const last = shown[shown.length - 1];
        const body: TicketListPage = {
          items,
          nextCursor:
            rows.length > query.limit && last
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
