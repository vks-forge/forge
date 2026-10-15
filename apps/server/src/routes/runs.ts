/**
 * `GET /projects/:slug/runs`, `GET /runs` and `GET /runs/:id`: the Runs screen.
 *
 * Why: the Runs screen lists Workers' attempts newest first with enough on each row (ticket,
 *   harness, status, duration, generation, cost, whether the harness is parked for quota) to
 *   spot a stuck or expensive run without opening it. `status` (repeatable or comma separated)
 *   narrows; paging is by an opaque cursor over (`started_at`, `id`) so a run that starts
 *   while the user scrolls cannot show twice or vanish. `GET /runs` is the same list across
 *   projects. A slug that is not a project is 404, a bad status, limit or cursor is 400, and
 *   `GET /runs/:id` adds the run's directory, session and gate verdicts for debugging.
 *
 * Exports: runsRoutes().
 * Depends on: @forge/core (RunListQuery), services/page-cursor, services/run-summary,
 *   services/find-project, services/http/*, types/routes. IO: reads storage.
 */

import { RunListQuery } from '@forge/core';
import type { RunListPage } from '@forge/core';
import { findProject } from '#/services/find-project.js';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import { decodePageCursor, encodePageCursor } from '#/services/page-cursor.js';
import { detailOfRun, loadRunContext, summarizeRun } from '#/services/run-summary.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

/** `?status=a&status=b,c` becomes `['a','b','c']`; absent stays undefined. */
function statusesOf(params: URLSearchParams): string[] | undefined {
  const given = params.getAll('status');

  return given.length === 0 ? undefined : given.flatMap((v) => v.split(','));
}

function listRoute(deps: RouteDeps, path: string): Route {
  return {
    method: 'GET',
    path,
    async handle({ res, params, url }) {
      const parsed = RunListQuery.safeParse({
        status: statusesOf(url.searchParams),
        limit: url.searchParams.get('limit') ?? undefined,
        cursor: url.searchParams.get('cursor') ?? undefined,
      });

      if (!parsed.success) {
        throw HttpError.fromZod(parsed.error);
      }

      const query = parsed.data;
      const after =
        query.cursor === undefined ? undefined : decodePageCursor(query.cursor);

      if (after === null) {
        throw new HttpError(
          400,
          'invalid_cursor',
          'cursor is not one this server issued',
        );
      }

      const slug = params['slug'];
      const nowMs = deps.now();
      const page = await deps.storage.transaction(async (tx) => {
        const project = slug === undefined ? undefined : await findProject(tx, slug);
        // One extra row tells whether another page exists without a second query.
        const rows = await tx.runs.list({
          ...(project ? { project: project.id } : {}),
          ...(query.status ? { statuses: query.status } : {}),
          limit: query.limit + 1,
          ...(after ? { after: { started_at: after.at, id: after.id } } : {}),
        });

        const shown = rows.slice(0, query.limit);
        const ctx = await loadRunContext(tx, shown, nowMs);
        const last = shown[shown.length - 1];
        const body: RunListPage = {
          items: shown.map((r) => summarizeRun(r, ctx)),
          nextCursor:
            rows.length > query.limit && last
              ? encodePageCursor({ at: last.started_at, id: last.id })
              : null,
        };

        return body;
      });

      sendJson(res, 200, page);
    },
  };
}

export function runsRoutes(deps: RouteDeps): Route[] {
  return [
    listRoute(deps, '/projects/:slug/runs'),
    listRoute(deps, '/runs'),
    {
      method: 'GET',
      path: '/runs/:id',
      async handle({ res, params }) {
        const id = params['id'] ?? '';
        const nowMs = deps.now();
        const detail = await deps.storage.transaction(async (tx) => {
          const run = await tx.runs.get(id);
          if (!run) {
            return null;
          }

          const gates = (await tx.gateResults.listByTicket(run.ticket_id)).filter(
            (g) => g.run_id === run.id,
          );

          return detailOfRun(run, await loadRunContext(tx, [run], nowMs), gates);
        });

        if (!detail) {
          throw new HttpError(404, 'run_not_found', `no run ${id}`);
        }

        sendJson(res, 200, detail);
      },
    },
  ];
}
