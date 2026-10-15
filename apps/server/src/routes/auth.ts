/**
 * `POST /auth/sse-ticket`: a 60-second ticket to watch one run's event stream.
 *
 * Why: the control room's `EventSource` cannot send an `Authorization` header. The page
 *   (which holds the install token) asks here, with the token, for a ticket bound to one run
 *   id and puts only the ticket in the stream URL, so the token never lands in a URL, the
 *   browser history or a log line. The ticket is useless for any other run and for any other
 *   route.
 *
 * Exports: authRoutes().
 * Depends on: schemas/api, services/http/body, services/http/respond, types/routes.
 *   IO: reads the request body.
 */

import { SseTicketBody } from '#/schemas/api.js';
import { readJson } from '#/services/http/body.js';
import { sendJson } from '#/services/http/respond.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

export function authRoutes(deps: RouteDeps): Route[] {
  return [
    {
      method: 'POST',
      path: '/auth/sse-ticket',
      async handle({ req, res }) {
        const { run_id: runId } = await readJson(req, SseTicketBody);
        const { ticket, expiresInSeconds } = deps.tickets.issue(runId);

        sendJson(res, 200, { ticket, expires_in_s: expiresInSeconds });
      },
    },
  ];
}
