/**
 * `GET /projects/:slug/cost`: the numbers behind the Cost page.
 *
 * Why: Cost shows where a project's money went. It is computed on request from the runs already
 *   stored, so it can never drift from the board and needs no new tables. The per-project stats
 *   route was removed (d-0166): the overview dashboard replaced Home's figures. Spend is only what runs recorded: the
 *   responses say how many runs and Director steps carried a cost rather than guessing the rest. The
 *   total adds the Director's own steps (its dated spend ledger) to the Workers' runs and carries the split, so the
 *   project total equals the sum of its cards' totals. `range` is 7d,
 *   30d or 90d (default 30d); anything else is a 400, an unregistered slug is a 404. The two
 *   ranked cost tables (tickets, runs) page independently with `ticket_limit` / `ticket_offset`
 *   and `run_limit` / `run_offset` (limit 1..100, default 50 = the report's old top 50); the
 *   report's `by_ticket_total` and `by_run_total` count every row of the window.
 *
 * Exports: projectStatsRoutes() (now only the cost route).
 * Depends on: @forge/core (stats and cost rules and schemas), services/collect-pages,
 *   services/find-project, services/http/*, types/routes. IO: reads storage and settings.
 */

import {
  CostPageQuery,
  StatsRangeQuery,
  computeCostReport,
  statsWindow,
} from '@forge/core';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';
import { collectRuns, collectTickets } from '#/services/collect-pages.js';
import { findProject } from '#/services/find-project.js';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';

function rangeOf(params: URLSearchParams) {
  const parsed = StatsRangeQuery.safeParse({ range: params.get('range') ?? undefined });
  if (!parsed.success) {
    throw HttpError.fromZod(parsed.error);
  }

  return parsed.data.range;
}

function costPageOf(params: URLSearchParams) {
  const parsed = CostPageQuery.safeParse({
    ticket_limit: params.get('ticket_limit') ?? undefined,
    ticket_offset: params.get('ticket_offset') ?? undefined,
    run_limit: params.get('run_limit') ?? undefined,
    run_offset: params.get('run_offset') ?? undefined,
  });

  if (!parsed.success) {
    throw HttpError.fromZod(parsed.error);
  }

  return {
    ticket: { limit: parsed.data.ticket_limit, offset: parsed.data.ticket_offset },
    run: { limit: parsed.data.run_limit, offset: parsed.data.run_offset },
  };
}

export function projectStatsRoutes(deps: RouteDeps): Route[] {
  return [
    {
      method: 'GET',
      path: '/projects/:slug/cost',
      async handle({ res, params, url }) {
        const range = rangeOf(url.searchParams);
        const page = costPageOf(url.searchParams);
        const nowMs = deps.now();
        const slug = params['slug'] ?? '';
        const { from } = statsWindow(range, nowMs);

        const project = await deps.storage.transaction((tx) => findProject(tx, slug));
        const { engine } = (await deps.config.project(slug)).config.forge;

        const report = await deps.storage.transaction(async (tx) => {
          const runs = await collectRuns(tx, { project: project.id, since: from });
          const titles = new Map<string, string>();
          for (const t of await collectTickets(tx, project.id)) {
            titles.set(t.id, t.title);
          }

          return computeCostReport({
            project: project.slug,
            range,
            nowMs,
            runs,
            directorSpend: await tx.directorSpend.listByProject(project.id, { from }),
            titles,
            page,
            budgets: {
              run_max_usd: engine.run_budget.max_usd,
              step_budget_usd: engine.step_budget_usd,
            },
          });
        });

        sendJson(res, 200, report);
      },
    },
  ];
}
