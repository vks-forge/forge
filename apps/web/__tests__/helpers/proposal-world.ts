/**
 * A stateful stand-in for the Director pipeline proposals of one project.
 *
 * Why: the Inbox drawer and the Pipelines tab both list the pending suggestions and both decide them,
 * and what the owner sees after deciding (the suggestion gone, the lane changed, a refusal in words)
 * depends on the server keeping state between the calls. This keeps that state: a list that forgets a
 * decided proposal like the real one, an accept that can be told to refuse as the server does (stale
 * lane, version conflict, rules no longer met), and a record of what was sent.
 *
 * Exports: proposalWorld(), ProposalWorld.
 * Depends on: @forge/core, helpers/fake-forge/pipeline-routes, helpers/fetch-stub,
 *   helpers/forge-data/proposal-data.
 */

import { PipelineProposal } from '@forge/core';
import type { PipelineProposalView } from '@forge/core';
import { pipelineRoutes } from '#tests/helpers/fake-forge/pipeline-routes.js';
import { json, refusal } from '#tests/helpers/fetch-stub.js';
import type { RouteHandler, Routes } from '#tests/helpers/fetch-stub.js';
import { PROPOSAL_ROUTE } from '#tests/helpers/forge-data/proposal-data.js';

const BASE = '/settings/projects/:slug/pipeline-proposals/:id';

export interface ProposalWorld {
  readonly routes: Routes;
  /** Bodies sent to accept and reject, in order. */
  readonly accepted: unknown[];
  readonly rejected: unknown[];
  readonly pending: () => readonly PipelineProposalView[];
  /** Decides every pending proposal elsewhere, as another window would. */
  readonly clear: () => void;
}

type AcceptMode = 'ok' | 'stale' | 'conflict' | 'invalid' | 'not_pending';

export function proposalWorld(
  initial: readonly PipelineProposalView[],
  options: { accept?: AcceptMode; rejectFails?: boolean } = {},
): ProposalWorld {
  let pending = [...initial];
  const accepted: unknown[] = [];
  const rejected: unknown[] = [];
  const lanes = pipelineRoutes()[
    'GET /settings/projects/:slug/pipelines'
  ] as RouteHandler;

  const idOf = (params: Readonly<Record<string, string>>): number => Number(params['id']);
  const decide = (id: number, status: 'accepted' | 'rejected') => {
    const found = pending.find((p) => p.id === id) ?? initial[0]!;

    pending = pending.filter((p) => p.id !== id);

    // The reply is the decided proposal without the view-only fields (`current`, `stale`).
    return {
      ...PipelineProposal.parse(found),
      status,
      decided_at: '2026-10-18T10:00:00.000Z',
    };
  };

  return {
    accepted,
    rejected,
    pending: () => pending,
    clear: () => {
      pending = [];
    },
    routes: {
      [PROPOSAL_ROUTE]: () => json({ proposals: pending }),
      [`POST ${BASE}/accept`]: async ({ params, body }) => {
        accepted.push(body);

        switch (options.accept ?? 'ok') {
          case 'stale':
            return refusal(409, 'proposal_stale', 'The lane changed.');
          case 'conflict':
            return refusal(409, 'version_conflict', 'Version moved.');
          case 'not_pending':
            return refusal(409, 'not_pending', 'Already decided.');
          case 'invalid':
            return refusal(400, 'pipeline_invalid', 'Invalid.');
          default:
            break;
        }

        const reply = await lanes({
          method: 'GET',
          path: '/settings/projects/sample-service/pipelines',
          query: new URLSearchParams(),
          params: { slug: 'sample-service' },
          body: undefined,
        });

        const pipelines = 'body' in reply ? reply.body : {};

        return json({ proposal: decide(idOf(params), 'accepted'), pipelines });
      },
      [`POST ${BASE}/reject`]: ({ params, body }) => {
        rejected.push(body);

        return options.rejectFails
          ? { networkError: true }
          : json({ proposal: decide(idOf(params), 'rejected') });
      },
    },
  };
}
