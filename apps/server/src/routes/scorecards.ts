/**
 * `GET /projects/:slug/scorecards`: how each agent and pipeline shape has been doing.
 *
 * Why: the Agents and Pipelines screens show a track record beside each agent and each pipeline shape: clean or
 *   pass rate, reworks, cost per ticket and how many tickets it rests on, so the owner can judge whom to trust
 *   with a stage (d-0081). The numbers are computed on every read from rows that already exist; nothing here is
 *   stored, and nothing changes a default. `range` is 30 or 90 days (90 by default); `agent` narrows the reply to
 *   one agent's card. A bad query is 400 `invalid_request`, an unknown project 404 `project_not_found`, an unknown
 *   agent 404 `agent_not_found`.
 *
 * Exports: scorecardRoutes().
 * Depends on: @forge/core (ScorecardRange), services/scorecard-source, services/http/{http-errors,respond}, types/routes.
 *   IO: reads storage.
 */

import { ScorecardRange } from '@forge/core';
import { z } from 'zod';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import { projectScorecards } from '#/services/scorecard-source.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

const Query = z.object({
  range: ScorecardRange.default('90d'),
  agent: z
    .string()
    .regex(/^[a-z][a-z0-9-]{1,47}$/)
    .optional(),
});

export function scorecardRoutes(deps: RouteDeps): Route[] {
  return [
    {
      method: 'GET',
      path: '/projects/:slug/scorecards',
      async handle({ res, params, url }) {
        const parsed = Query.safeParse({
          range: url.searchParams.get('range') ?? undefined,
          agent: url.searchParams.get('agent') ?? undefined,
        });

        if (!parsed.success) {
          throw HttpError.fromZod(parsed.error);
        }

        sendJson(
          res,
          200,
          await projectScorecards(
            {
              config: deps.config,
              storage: deps.storage,
              catalogue: deps.catalogue,
              compat: deps.compat,
              now: deps.now,
              ports: deps.agentPorts,
            },
            params['slug'] ?? '',
            parsed.data.range,
            parsed.data.agent,
          ),
        );
      },
    },
  ];
}
