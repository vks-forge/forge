/**
 * The `http` side of the pipeline proposals and scorecards resources.
 *
 * Why: this is the only place that knows these paths. Proposals live under a project's
 *   settings (they change its lanes), scorecards under the project itself (they are read-only
 *   figures). Every answer is parsed with the schemas in `schemas/pipeline-proposals`, so a server
 *   and UI that disagree fail at the boundary with the field named.
 *
 * Exports: createProposalsHttp(), createScorecardsHttp().
 * Depends on: api/http/request-json, schemas/pipeline-proposals, types/api.types, types/proposals-api.types.
 */

import { requestJson } from '#/api/http/request-json.js';
import {
  AcceptProposalReply,
  ProposalsReply,
  RejectProposalReply,
  ScorecardReply,
} from '#/schemas/pipeline-proposals.js';
import type { HttpClientOptions } from '#/types/api.types.js';
import type { ProposalsApi, ScorecardsApi } from '#/types/proposals-api.types.js';

const enc = encodeURIComponent;

const base = (slug: string): string =>
  `/settings/projects/${enc(slug)}/pipeline-proposals`;

export function createProposalsHttp(client: HttpClientOptions): ProposalsApi {
  return {
    async list(slug, status, options) {
      const reply = await requestJson(
        client,
        `${base(slug)}?status=${status}`,
        ProposalsReply,
        options,
      );

      return reply.proposals;
    },

    accept: (slug, id, body) =>
      requestJson(client, `${base(slug)}/${id}/accept`, AcceptProposalReply, {
        method: 'POST',
        body: {
          expected_version: body.expected_version,
          ...(body.reason === undefined || body.reason.trim() === ''
            ? {}
            : { reason: body.reason.trim() }),
        },
      }),

    async reject(slug, id, body) {
      const reply = await requestJson(
        client,
        `${base(slug)}/${id}/reject`,
        RejectProposalReply,
        { method: 'POST', body: { reason: body.reason.trim() } },
      );

      return reply.proposal;
    },
  };
}

export function createScorecardsHttp(client: HttpClientOptions): ScorecardsApi {
  return {
    get: (query, options) =>
      requestJson(
        client,
        `/projects/${enc(query.slug)}/scorecards?range=${query.range}${
          query.agent === undefined ? '' : `&agent=${enc(query.agent)}`
        }`,
        ScorecardReply,
        options,
      ),
  };
}
