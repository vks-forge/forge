/**
 * `GET /stats/overview`: the cross-project numbers behind the Overview dashboard at `/`.
 *
 * Why: an owner running several projects needs one answer to "how is all the work going, what
 *   waits on me, what does it cost". The route reads each chosen project's rows, hands them to
 *   core's pure `computeOverviewStats` and returns the sums bucketed by hour, day, week or month.
 *   Nothing is stored: like Home and Cost it is computed on request, so it cannot drift from
 *   the board. `range` is today, 7d, 30d, 90d, 12m or all (default 30d) and `group` hour,
 *   day, week or month (default follows the range); anything else is a 400, and so is an hour
 *   group on any range but today (or today on any group but hour). Today runs from the server's
 *   local midnight to now, cut into local hours, so the offset is read from the server clock. `projects` is a comma list of
 *   slugs: unregistered ones are ignored and named in `unknown`, so a typo never looks like a
 *   quiet project. Without it every open project is included; `archived=1` adds archived
 *   ones. Naming an archived slug includes it whatever the flag says.
 *
 * Exports: statsOverviewRoutes().
 * Depends on: @forge/core (overview rules and schemas), services/budget-default, services/overview-source,
 *   services/http/*, types/routes. IO: reads storage and each project's memory repository.
 */

import {
  OverviewQuery,
  computeOverviewStats,
  defaultGroup,
  overviewRunsSince,
} from '@forge/core';
import type { BudgetDefault } from '@forge/core';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';
import { budgetDefaultForProject } from '#/services/budget-default.js';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import { readOverviewProject } from '#/services/overview-source.js';

export function statsOverviewRoutes(deps: RouteDeps): Route[] {
  return [
    {
      method: 'GET',
      path: '/stats/overview',
      async handle({ res, url }) {
        const parsed = OverviewQuery.safeParse({
          range: url.searchParams.get('range') ?? undefined,
          group: url.searchParams.get('group') ?? undefined,
          projects: url.searchParams.getAll('projects').join(',') || undefined,
          archived: url.searchParams.get('archived') ?? undefined,
        });

        if (!parsed.success) {
          throw HttpError.fromZod(parsed.error);
        }

        const query = parsed.data;
        const nowMs = deps.now();
        // Minutes east of UTC on the server's clock at this moment; `today` starts at its midnight.
        const utcOffsetMinutes = -new Date(nowMs).getTimezoneOffset();
        const known = await deps.storage.transaction((tx) => tx.projects.list());
        const bySlug = new Map(known.map((p) => [p.slug, p]));
        const chosen =
          query.projects.length === 0
            ? known.filter((p) => query.archived || p.status !== 'archived')
            : query.projects.flatMap((slug) => bySlug.get(slug) ?? []);

        const memory = new Map<
          string,
          Awaited<ReturnType<typeof deps.memory.reader.list>>
        >();

        for (const p of chosen) {
          memory.set(p.slug, await deps.memory.reader.list(p.slug));
        }

        // Settings are read before the storage transaction (they share one writer queue).
        const budgets = await Promise.all(
          chosen.map((p) => budgetDefaultForProject(deps.config, p.slug)),
        );

        const since = overviewRunsSince(query.range, nowMs, utcOffsetMinutes);
        const projects = await deps.storage.transaction(async (tx) => {
          const rows = [];
          for (const [i, p] of chosen.entries()) {
            rows.push(
              await readOverviewProject(
                tx,
                p,
                since,
                memory.get(p.slug) ?? [],
                nowMs,
                (kind) => deps.compat.installedVersion(kind),
                budgets[i] as BudgetDefault,
              ),
            );
          }

          return rows;
        });

        sendJson(
          res,
          200,
          computeOverviewStats({
            range: query.range,
            group: query.group ?? defaultGroup(query.range),
            nowMs,
            utcOffsetMinutes,
            projects,
            unknown: query.projects.filter((slug) => !bySlug.has(slug)),
          }),
        );
      },
    },
  ];
}
