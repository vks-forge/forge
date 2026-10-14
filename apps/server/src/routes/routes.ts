/**
 * The server's route table.
 *
 * Why: one list of every endpoint, in one place, is what a reviewer reads to see the whole
 *   API surface of an unauthenticated local service (d-0061).
 *
 * Exports: buildRoutes().
 * Depends on: every route module, types/routes. No IO.
 */

import { answerRoute } from '#/routes/interactions.js';
import { healthRoute } from '#/routes/health.js';
import { hookRoute } from '#/routes/hook.js';
import { intakeRoute } from '#/routes/intake.js';
import { runEventsRoute } from '#/routes/run-events.js';
import { ticketRoute } from '#/routes/tickets.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

export function buildRoutes(deps: RouteDeps): Route[] {
  return [
    intakeRoute(deps),
    ticketRoute(deps),
    answerRoute(deps),
    runEventsRoute(deps),
    hookRoute(deps),
    healthRoute(deps),
  ];
}
