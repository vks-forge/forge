/**
 * The server's route table.
 *
 * Why: one list of every endpoint, in one place, is what a reviewer reads to see the whole
 *   API surface of the local service (d-0061). Every route needs the install token unless it
 *   says `access: 'open'`; only `/health` and the hook route do.
 *
 * Exports: buildRoutes().
 * Depends on: every route module, types/routes. No IO.
 */

import { adminRoutes } from '#/routes/admin.js';
import { authRoutes } from '#/routes/auth.js';
import { harnessRoutes } from '#/routes/harnesses.js';
import { answerRoute } from '#/routes/interactions.js';
import { healthRoute } from '#/routes/health.js';
import { githubConnectionRoutes } from '#/routes/github-connections.js';
import { hookRoute } from '#/routes/hook.js';
import { intakeRoute } from '#/routes/intake.js';
import { memoryRoutes } from '#/routes/memory.js';
import { projectsRoutes } from '#/routes/projects.js';
import { runEventsRoute } from '#/routes/run-events.js';
import { settingsRoutes } from '#/routes/settings.js';
import { ticketListRoute } from '#/routes/ticket-list.js';
import { ticketRoute } from '#/routes/tickets.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

export function buildRoutes(deps: RouteDeps): Route[] {
  return [
    intakeRoute(deps),
    ticketRoute(deps),
    ticketListRoute(deps),
    answerRoute(deps),
    runEventsRoute(deps),
    hookRoute(deps),
    healthRoute(deps),
    ...authRoutes(deps),
    ...adminRoutes(deps),
    ...settingsRoutes(deps),
    ...harnessRoutes(deps),
    ...projectsRoutes(deps),
    ...memoryRoutes(deps),
    ...githubConnectionRoutes(deps),
  ];
}
