/**
 * `/settings/pipelines/*`: the company's lane pipelines and the validate door.
 *
 * Why: a lane pipeline says who does the work of a ticket and in what order (d-0136, d-0152), and
 *   the owner edits it as a list. The screens read the effective pipeline of the three lanes
 *   (tagged built-in or edited, with whether the lane can run today), save one lane's list, reset
 *   a lane to what the release ships, and ask whether a draft list holds before saving it. Every
 *   write names the version the editor saw and a reason, and answers with the fresh views so the
 *   client never re-derives a tag or a hash. A list that breaks a safety rule is refused with
 *   400 `pipeline_invalid` and every problem listed; nothing is stored. Routes parse and call;
 *   the rules are in the pipeline store.
 *
 * Exports: pipelineRoutes().
 * Depends on: schemas/pipeline-api, services/pipeline-services, services/http/{body,respond},
 *   types/routes. IO: through the pipeline store.
 */

import {
  PipelineResetBody,
  PipelineSaveBody,
  PipelineValidateBody,
} from '#/schemas/pipeline-api.js';
import { readJson } from '#/services/http/body.js';
import { sendJson } from '#/services/http/respond.js';
import { pipelineStoreFor } from '#/services/pipeline-services.js';
import type { Route, RouteContext } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

const laneOf = (ctx: RouteContext): string => ctx.params['lane'] ?? '';

export function pipelineRoutes(deps: RouteDeps): Route[] {
  const store = pipelineStoreFor(deps);

  return [
    {
      method: 'GET',
      path: '/settings/pipelines',
      async handle({ res }) {
        sendJson(res, 200, await store.company());
      },
    },
    {
      method: 'POST',
      path: '/settings/pipelines/validate',
      async handle(ctx) {
        const body = await readJson(ctx.req, PipelineValidateBody);
        sendJson(ctx.res, 200, await store.validate(body));
      },
    },
    {
      method: 'PUT',
      path: '/settings/pipelines/:lane',
      async handle(ctx) {
        const body = await readJson(ctx.req, PipelineSaveBody);
        sendJson(ctx.res, 200, await store.saveCompany(laneOf(ctx), body));
      },
    },
    {
      method: 'POST',
      path: '/settings/pipelines/:lane/reset',
      async handle(ctx) {
        const body = await readJson(ctx.req, PipelineResetBody);
        sendJson(ctx.res, 200, await store.resetCompany(laneOf(ctx), body));
      },
    },
  ];
}
