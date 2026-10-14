/**
 * `POST /intake`: a trigger hands the Director an event.
 *
 * Why: chat, webhooks and cron all reach the Director as intake events (director-core.md
 *   §7). The body is the core `IntakeEvent` schema, so a new trigger needs no change here.
 *   The answer is 202 with what the engine did with it (a ticket was created, it was a
 *   duplicate, it was ignored and why): the work happens on the next tick, not in the
 *   request, so a model outage never fails an intake call.
 *
 * Exports: intakeRoute().
 * Depends on: @forge/core (IntakeEvent), services/http/body, services/http/respond,
 *   types/routes. IO: calls the engine.
 */

import { IntakeEvent } from '@forge/core';
import { readJson } from '#/services/http/body.js';
import { sendJson } from '#/services/http/respond.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

export function intakeRoute(deps: RouteDeps): Route {
  return {
    method: 'POST',
    path: '/intake',
    async handle({ req, res }) {
      const event = await readJson(req, IntakeEvent);
      const result = await deps.engine.ingest(event);

      sendJson(res, 202, result);
    },
  };
}
