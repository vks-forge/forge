/**
 * `GET /health`: is the server up. Open to everyone, returns no data.
 *
 * Why: the CLI needs a cheap, unauthenticated answer to "is the process on this port a Forge
 *   server and does it work" before it has, or while it is looking for, the install token.
 *   Because anyone on the machine can call it, it says only `forge` and `ok` or `degraded`;
 *   owner ids, run counts and uptime would tell another local program what Forge is doing.
 *   It still proves the database answers, so a locked or broken store shows as 503 instead
 *   of a healthy-looking process that cannot move a ticket. The route is open, so each call
 *   would otherwise open a database transaction for anyone on the machine; the answer is
 *   cached for one second, which keeps a polling client honest and a hostile one cheap.
 *
 * Exports: healthRoute(), HEALTH_CACHE_MS.
 * Depends on: services/http/respond, types/routes. IO: one storage read.
 */

import { sendJson } from '#/services/http/respond.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

/** How long a database answer is reused. */
export const HEALTH_CACHE_MS = 1000;

export function healthRoute(deps: RouteDeps): Route {
  let cached: { at: number; database: boolean } | null = null;

  return {
    method: 'GET',
    path: '/health',
    access: 'open',
    async handle({ res }) {
      const now = deps.now();
      if (!cached || now - cached.at >= HEALTH_CACHE_MS || now < cached.at) {
        let database = true;
        try {
          await deps.storage.transaction((tx) => tx.projects.list());
        } catch {
          database = false;
        }

        cached = { at: now, database };
      }

      const { database } = cached;

      sendJson(res, database ? 200 : 503, {
        service: 'forge',
        status: database ? 'ok' : 'degraded',
      });
    },
  };
}
