/**
 * `GET /projects/:slug/stats` and `GET /projects/:slug/cost`: the numbers behind Home and Cost.
 *
 * Why: Home shows how one project is doing (d-0104) and Cost shows where its money went. Both
 *   are computed on request from tickets, runs and gate verdicts already stored, so they can
 *   never drift from the board and need no new tables. Spend is only what runs recorded: the
 *   responses say how many runs carried a cost rather than guessing the rest. `range` is 7d,
 *   30d or 90d (default 30d); anything else is a 400, an unregistered slug is a 404. The two
 *   ranked cost tables (tickets, runs) page independently with `ticket_limit` / `ticket_offset`
 *   and `run_limit` / `run_offset` (limit 1..100, default 50 = the report's old top 50); the
 *   report's `by_ticket_total` and `by_run_total` count every row of the window.
 *
 * Exports: projectStatsRoutes().
 * Depends on: @forge/core (stats and cost rules and schemas), services/collect-pages,
 *   services/find-project, services/http/*, types/routes. IO: reads storage and settings.
 */

import {
  CostPageQuery,
  StatsRangeQuery,
  computeCostReport,
  computeProjectStats,
  statsWindow,
} from '@forge/core';
import type { GateResult } from '@forge/core';
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
      path: '/projects/:slug/stats',
      async handle({ res, params, url }) {
        const range = rangeOf(url.searchParams);
        const nowMs = deps.now();

        const stats = await deps.storage.transaction(async (tx) => {
          const project = await findProject(tx, params['slug'] ?? '');
          const { from } = statsWindow(range, nowMs);
          const runs = await collectRuns(tx, { project: project.id, since: from });
          const active = await collectRuns(tx, {
            project: project.id,
            statuses: ['starting', 'running'],
          });

          const gates: GateResult[] = [];
          for (const ticketId of new Set(runs.map((r) => r.ticket_id))) {
            gates.push(...(await tx.gateResults.listByTicket(ticketId)));
          }

          return computeProjectStats({
            project: project.slug,
            range,
            nowMs,
            tickets: await collectTickets(tx, project.id),
            runs,
            gates,
            activeRuns: active.length,
          });
        });

        sendJson(res, 200, stats);
      },
    },
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
