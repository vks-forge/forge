/**
 * `/settings/projects/:slug/pipelines/*` and `/routing`: a project's lane pipelines and routing rules.
 *
 * Why: a project may replace any lane's pipeline with its own and add routing rules that put an
 *   extra check on work touching certain paths (d-0151, d-0069). The view marks each lane
 *   `changed` when the project has its own list, so the screen can say "changed from the company
 *   default" and offer Reset, which removes only the project's list. Routing rules only add
 *   reviewers or researchers, never writers; a rule list that names a writer, an unknown agent
 *   or repeats an id is refused with 400 `routing_invalid` and every problem listed. The project
 *   in the path must exist (404 `project_not_found`), and every write names the project version
 *   the editor saw and a reason, as the company routes do.
 *
 * Exports: projectPipelineRoutes().
 * Depends on: schemas/pipeline-api, services/pipeline-services, services/http/{body,respond},
 *   types/routes. IO: through the pipeline store.
 */

import {
  PipelineResetBody,
  PipelineSaveBody,
  RoutingSaveBody,
} from '#/schemas/pipeline-api.js';
import { readJson } from '#/services/http/body.js';
import { sendJson } from '#/services/http/respond.js';
import { pipelineStoreFor } from '#/services/pipeline-services.js';
import type { Route, RouteContext } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

const slugOf = (ctx: RouteContext): string => ctx.params['slug'] ?? '';
const laneOf = (ctx: RouteContext): string => ctx.params['lane'] ?? '';

export function projectPipelineRoutes(deps: RouteDeps): Route[] {
  const store = pipelineStoreFor(deps);

  return [
    {
      method: 'GET',
      path: '/settings/projects/:slug/pipelines',
      async handle(ctx) {
        sendJson(ctx.res, 200, await store.project(slugOf(ctx)));
      },
    },
    {
      method: 'PUT',
      path: '/settings/projects/:slug/pipelines/:lane',
      async handle(ctx) {
        const body = await readJson(ctx.req, PipelineSaveBody);
        sendJson(ctx.res, 200, await store.saveProject(slugOf(ctx), laneOf(ctx), body));
      },
    },
    {
      method: 'POST',
      path: '/settings/projects/:slug/pipelines/:lane/reset',
      async handle(ctx) {
        const body = await readJson(ctx.req, PipelineResetBody);
        sendJson(ctx.res, 200, await store.resetProject(slugOf(ctx), laneOf(ctx), body));
      },
    },
    {
      method: 'PUT',
      path: '/settings/projects/:slug/routing',
      async handle(ctx) {
        const body = await readJson(ctx.req, RoutingSaveBody);
        sendJson(ctx.res, 200, await store.saveRouting(slugOf(ctx), body));
      },
    },
  ];
}
