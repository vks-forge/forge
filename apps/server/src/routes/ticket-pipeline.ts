/**
 * `GET /tickets/:id/pipeline` and `GET /tickets/:id/artifacts/:artifactId`: the ticket's stage strip and artifacts.
 *
 * Why: the Ticket page shows where a ticket is in its lane pipeline (which stages passed, which
 *   is running, how many reworks it used, which checks a rule added) and lets the owner open a
 *   stage to see its findings and exactly what its agent was shown. The strip is null until the
 *   ticket's first dispatch, when it takes its own copy of the pipeline. An artifact is fetched
 *   one at a time (a diff can be large) and only within its own ticket; the owner may read the
 *   Worker's narrative here, which reviewers never see (d-0070).
 *
 * Exports: ticketPipelineRoutes().
 * Depends on: services/ticket-pipeline-view, services/http/respond, types/routes. IO: reads storage.
 */

import { sendJson } from '#/services/http/respond.js';
import { ticketArtifact, ticketPipeline } from '#/services/ticket-pipeline-view.js';
import type { AgentDeps } from '#/types/agent-store.types.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

export function ticketPipelineRoutes(deps: RouteDeps): Route[] {
  const reads: AgentDeps = {
    config: deps.config,
    storage: deps.storage,
    catalogue: deps.catalogue,
    compat: deps.compat,
    now: deps.now,
    ports: deps.agentPorts,
  };

  return [
    {
      method: 'GET',
      path: '/tickets/:id/pipeline',
      async handle({ res, params }) {
        sendJson(res, 200, { pipeline: await ticketPipeline(reads, params['id'] ?? '') });
      },
    },
    {
      method: 'GET',
      path: '/tickets/:id/artifacts/:artifactId',
      async handle({ res, params }) {
        sendJson(
          res,
          200,
          await ticketArtifact(reads, params['id'] ?? '', params['artifactId'] ?? ''),
        );
      },
    },
  ];
}
