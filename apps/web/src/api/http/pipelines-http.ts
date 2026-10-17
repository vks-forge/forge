/**
 * The `http` side of the pipelines resource.
 *
 * Why: this is the only place that knows the pipeline paths. Company defaults live under
 *   `/settings/pipelines`, a project's lists and routing under `/settings/projects/:slug/...`,
 *   and a ticket's own copy under `/tickets/:id/pipeline`. A company answer carries one version
 *   and a project answer a pair; both are reduced here to one list shape (the lanes, the rules
 *   and the version a write must name), so a screen never branches on which scope answered. A
 *   definition is parsed with the core schema before it is sent, so a malformed form fails in
 *   the browser rather than as a server refusal.
 *
 * Exports: createPipelinesHttp().
 * Depends on: api/http/request-json, schemas/pipelines, types/pipeline-api.types.
 */

import { requestJson } from '#/api/http/request-json.js';
import {
  CompanyPipelinesReply,
  PipelineDefinition,
  ProjectPipelinesReply,
  StageArtifact,
  TicketPipelineReply,
  ValidateReply,
} from '#/schemas/pipelines.js';
import type { z } from 'zod';
import type { HttpClientOptions } from '#/types/api.types.js';
import type {
  PipelineList,
  PipelineScope,
  PipelinesApi,
} from '#/types/pipeline-api.types.js';

const enc = encodeURIComponent;

function prefix(scope: PipelineScope): string {
  return scope.kind === 'company'
    ? '/settings/pipelines'
    : `/settings/projects/${enc(scope.slug)}/pipelines`;
}

function toList(
  reply: z.infer<typeof CompanyPipelinesReply> | z.infer<typeof ProjectPipelinesReply>,
): PipelineList {
  const { version } = reply;

  return {
    lanes: reply.pipelines,
    routing: 'routing' in reply ? reply.routing : [],
    version: typeof version === 'number' ? version : version.project,
    companyVersion: typeof version === 'number' ? version : version.company,
  };
}

const schemaOf = (scope: PipelineScope) =>
  scope.kind === 'company' ? CompanyPipelinesReply : ProjectPipelinesReply;

export function createPipelinesHttp(client: HttpClientOptions): PipelinesApi {
  return {
    async list(scope, options) {
      return toList(await requestJson(client, prefix(scope), schemaOf(scope), options));
    },

    async save(scope, lane, body) {
      return toList(
        await requestJson(client, `${prefix(scope)}/${lane}`, schemaOf(scope), {
          method: 'PUT',
          body: {
            pipeline: PipelineDefinition.parse(body.pipeline),
            expected_version: body.expected_version,
            reason: body.reason,
          },
        }),
      );
    },

    async reset(scope, lane, meta) {
      return toList(
        await requestJson(client, `${prefix(scope)}/${lane}/reset`, schemaOf(scope), {
          method: 'POST',
          body: meta,
        }),
      );
    },

    async saveRouting(slug, body) {
      return toList(
        await requestJson(
          client,
          `/settings/projects/${enc(slug)}/routing`,
          ProjectPipelinesReply,
          { method: 'PUT', body },
        ),
      );
    },

    validate(body, options) {
      return requestJson(client, '/settings/pipelines/validate', ValidateReply, {
        ...options,
        method: 'POST',
        body: {
          lane: body.lane,
          pipeline: body.pipeline,
          ...(body.project === undefined ? {} : { project: body.project }),
        },
      });
    },

    async ticket(id, options) {
      const reply = await requestJson(
        client,
        `/tickets/${enc(id)}/pipeline`,
        TicketPipelineReply,
        options,
      );

      return reply.pipeline;
    },

    artifact(ticketId, artifactId, options) {
      return requestJson(
        client,
        `/tickets/${enc(ticketId)}/artifacts/${artifactId}`,
        StageArtifact,
        options,
      );
    },
  };
}
