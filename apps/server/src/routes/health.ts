/**
 * `GET /health`: is the server up, who owns it, how busy is it.
 *
 * Why: operators and the CLI need a cheap answer to "is Forge running and what is it doing"
 *   without reading the database themselves. It also proves the database answers, so a
 *   locked or broken store shows as 503 instead of a healthy-looking process that cannot
 *   move a ticket. It reports counts only, never ticket content or any credential.
 *
 * Exports: healthRoute().
 * Depends on: services/http/respond, types/routes. IO: one storage read.
 */

import { sendJson } from '#/services/http/respond.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

export function healthRoute(deps: RouteDeps): Route {
  return {
    method: 'GET',
    path: '/health',
    async handle({ res }) {
      let database = true;
      try {
        await deps.storage.transaction((tx) => tx.projects.list());
      } catch {
        database = false;
      }

      sendJson(res, database ? 200 : 503, {
        status: database ? 'ok' : 'degraded',
        database: database ? 'ok' : 'unavailable',
        owner: deps.owner,
        uptime_s: Math.round((deps.now() - deps.startedAt) / 1000),
        live_runs: deps.engine.liveRunIds().length,
        gate_jobs_in_flight: deps.engine.gateJobsInFlight(),
      });
    },
  };
}
