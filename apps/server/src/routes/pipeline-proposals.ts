/**
 * `/settings/projects/:slug/pipeline-proposals`: the Director's suggestions to change a lane, and the owner's answer.
 *
 * Why: when the Director keeps making the same change to ticket pipelines it records a proposal instead of editing
 *   the project's lane (d-0151, d-0019). The owner reads it beside the lane as it is now, then accepts (the lane
 *   is saved through the ordinary pipeline save door, authored by the owner) or rejects with a reason (the same
 *   change on the same base is never proposed again). A proposal made against a list the owner has since changed
 *   is stale: accepting it is refused with 409 `proposal_stale` and writes nothing. These routes only parse a
 *   body and call the pipeline store, the one writer of a decided proposal. Errors: 404 `project_not_found`,
 *   `proposal_not_found`; 409 `not_pending`, `proposal_stale`, `version_conflict`; 400 `invalid_request`,
 *   `pipeline_invalid` (the roster changed since, with its problems).
 *
 * Exports: pipelineProposalRoutes().
 * Depends on: @forge/core (AcceptProposalBody, RejectProposalBody), services/pipeline-services, services/http/{body,
 *   http-errors,respond}, types/routes. IO: through the pipeline store.
 */

import { AcceptProposalBody, RejectProposalBody } from '@forge/core';
import { z } from 'zod';
import { readJson } from '#/services/http/body.js';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import { pipelineStoreFor } from '#/services/pipeline-services.js';
import type { Route, RouteContext } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

const Query = z.object({ status: z.enum(['pending', 'all']).default('pending') });
const slugOf = (ctx: RouteContext): string => ctx.params['slug'] ?? '';
const idOf = (ctx: RouteContext): string => ctx.params['id'] ?? '';

export function pipelineProposalRoutes(deps: RouteDeps): Route[] {
  const store = pipelineStoreFor(deps);

  return [
    {
      method: 'GET',
      path: '/settings/projects/:slug/pipeline-proposals',
      async handle(ctx) {
        const parsed = Query.safeParse({
          status: ctx.url.searchParams.get('status') ?? undefined,
        });

        if (!parsed.success) {
          throw HttpError.fromZod(parsed.error);
        }

        sendJson(ctx.res, 200, {
          proposals: await store.proposals(slugOf(ctx), parsed.data.status),
        });
      },
    },
    {
      method: 'POST',
      path: '/settings/projects/:slug/pipeline-proposals/:id/accept',
      async handle(ctx) {
        const body = await readJson(ctx.req, AcceptProposalBody);
        sendJson(ctx.res, 200, await store.acceptProposal(slugOf(ctx), idOf(ctx), body));
      },
    },
    {
      method: 'POST',
      path: '/settings/projects/:slug/pipeline-proposals/:id/reject',
      async handle(ctx) {
        const body = await readJson(ctx.req, RejectProposalBody);
        sendJson(ctx.res, 200, await store.rejectProposal(slugOf(ctx), idOf(ctx), body));
      },
    },
  ];
}
