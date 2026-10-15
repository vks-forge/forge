/**
 * `GET /health`: is the server up. Open to everyone, returns no data.
 *
 * Why: the CLI needs a cheap, unauthenticated answer to "is the process on this port a Forge
 *   server and does it work" before it has, or while it is looking for, the install token.
 *   Because anyone on the machine can call it, it says only `forge` and `ok` or `degraded`;
 *   owner ids, run counts and uptime would tell another local program what Forge is doing.
 *   It still proves the database answers, so a locked or broken store shows as 503 instead
 *   of a healthy-looking process that cannot move a ticket.
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
    access: 'open',
    async handle({ res }) {
      let database = true;
      try {
        await deps.storage.transaction((tx) => tx.projects.list());
      } catch {
        database = false;
      }

      sendJson(res, database ? 200 : 503, {
        service: 'forge',
        status: database ? 'ok' : 'degraded',
      });
    },
  };
}
