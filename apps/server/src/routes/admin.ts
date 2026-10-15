/**
 * `POST /admin/shutdown`: stop the server cleanly from a client.
 *
 * Why: the server runs in the background with no terminal, and Windows has no graceful
 *   SIGTERM for a detached process, so `forge stop` needs a door that runs the same graceful
 *   shutdown as Ctrl-C (cancel live runs, finish gate jobs, close the port and the database).
 *   It answers 202 first and shuts down after the response is flushed, because shutdown
 *   closes the very connection the answer travels on. It needs the install token like every
 *   other route.
 *
 * Exports: adminRoutes().
 * Depends on: services/http/respond, types/routes. IO: starts the shutdown.
 */

import { sendJson } from '#/services/http/respond.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

export function adminRoutes(deps: RouteDeps): Route[] {
  return [
    {
      method: 'POST',
      path: '/admin/shutdown',
      async handle({ res }) {
        res.once('finish', () => deps.requestShutdown());
        sendJson(res, 202, { status: 'stopping' });
      },
    },
  ];
}
