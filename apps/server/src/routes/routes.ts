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
import { agentRoutes } from '#/routes/agents.js';
import { authRoutes } from '#/routes/auth.js';
import { cardPlanRoutes } from '#/routes/card-plan.js';
import { cardRoutes } from '#/routes/cards.js';
import { historyRoutes } from '#/routes/history.js';
import { folderPickRoute } from '#/routes/folder-pick.js';
import { folderRoutes } from '#/routes/folders.js';
import { harnessRoutes } from '#/routes/harnesses.js';
import { escalationRoutes } from '#/routes/escalations.js';
import { ticketConsequencesRoute } from '#/routes/ticket-consequences.js';
import { answerRoute } from '#/routes/interactions.js';
import { healthRoute } from '#/routes/health.js';
import { inboxRoutes } from '#/routes/inbox.js';
import { githubConnectionRoutes } from '#/routes/github-connections.js';
import { hookRoute } from '#/routes/hook.js';
import { intakeRoute } from '#/routes/intake.js';
import { memoryRoutes } from '#/routes/memory.js';
import { memorySearchRoutes } from '#/routes/memory-search.js';
import { pipelineRoutes } from '#/routes/pipelines.js';
import { projectAgentRoutes } from '#/routes/project-agents.js';
import { pipelineProposalRoutes } from '#/routes/pipeline-proposals.js';
import { projectPipelineRoutes } from '#/routes/project-pipelines.js';
import { projectEventsRoute } from '#/routes/project-events.js';
import { projectStatsRoutes } from '#/routes/project-stats.js';
import { statsOverviewRoutes } from '#/routes/stats-overview.js';
import { projectInspectRoutes } from '#/routes/project-inspect.js';
import { projectDeleteRoutes } from '#/routes/project-delete.js';
import { projectsRoutes } from '#/routes/projects.js';
import { researchRoutes } from '#/routes/research.js';
import { runEventsRoute } from '#/routes/run-events.js';
import { scorecardRoutes } from '#/routes/scorecards.js';
import { runSteerRoute } from '#/routes/run-steer.js';
import { runsRoutes } from '#/routes/runs.js';
import { setupCacheRoutes } from '#/routes/setup-cache.js';
import { settingsRoutes } from '#/routes/settings.js';
import { systemRoutes } from '#/routes/system.js';
import { ticketEditRoute } from '#/routes/ticket-edit.js';
import { ticketListRoute } from '#/routes/ticket-list.js';
import { ticketPipelineRoutes } from '#/routes/ticket-pipeline.js';
import { ticketRoute } from '#/routes/tickets.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

export function buildRoutes(deps: RouteDeps): Route[] {
  return [
    intakeRoute(deps),
    ticketRoute(deps),
    ticketEditRoute(deps),
    ticketListRoute(deps),
    ...ticketPipelineRoutes(deps),
    ...cardRoutes(deps),
    ...historyRoutes(deps),
    ...cardPlanRoutes(deps),
    answerRoute(deps),
    ...escalationRoutes(deps),
    ticketConsequencesRoute(deps),
    runEventsRoute(deps),
    projectEventsRoute(deps),
    runSteerRoute(deps),
    hookRoute(deps),
    healthRoute(deps),
    ...authRoutes(deps),
    ...adminRoutes(deps),
    ...settingsRoutes(deps),
    ...setupCacheRoutes(deps),
    ...agentRoutes(deps),
    ...projectAgentRoutes(deps),
    ...pipelineRoutes(deps),
    ...projectPipelineRoutes(deps),
    ...pipelineProposalRoutes(deps),
    ...harnessRoutes(deps),
    ...folderRoutes(deps),
    folderPickRoute(deps),
    ...projectInspectRoutes(deps),
    ...projectsRoutes(deps),
    ...projectDeleteRoutes(deps),
    ...systemRoutes(deps),
    // The fixed words (search, import, export, access-log) must come before the `:id` of a record.
    ...memorySearchRoutes(deps),
    ...memoryRoutes(deps),
    ...githubConnectionRoutes(deps),
    ...projectStatsRoutes(deps),
    ...scorecardRoutes(deps),
    ...statsOverviewRoutes(deps),
    ...inboxRoutes(deps),
    ...runsRoutes(deps),
    ...researchRoutes(deps),
  ];
}
