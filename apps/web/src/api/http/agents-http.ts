/**
 * The `http` side of the agents resource.
 *
 * Why: this is the only place that knows the agent paths. Company agents live under
 *   `/settings/agents`, a project's under `/settings/projects/:slug/agents`, and the same verbs
 *   exist under both; a project's "reset" is the server's `reset-override`. Every answer is
 *   parsed with the schemas in `schemas/agents` and then reduced to one shape (the scope's list
 *   plus the version a write must name), so a screen never branches on which scope answered. An
 *   agent is parsed with `AgentFields` before it is sent, so a malformed form fails in the
 *   browser with the field named rather than as a server refusal.
 *
 * Exports: createAgentsHttp().
 * Depends on: api/http/request-json, schemas/agents, types/agents-api.types, types/agent-ui.types.
 */

import { requestJson } from '#/api/http/request-json.js';
import {
  AgentFields,
  AgentTestResult,
  CatalogueReply,
  CompanyAgentsReply,
  CompanyAgentWriteReply,
  DraftAgentOutput,
  DuplicateReply,
  HistoryReply,
  ProjectAgentsReply,
  ProjectAgentWriteReply,
  RunsOnReply,
  TemplatesReply,
} from '#/schemas/agents.js';
import type { z } from 'zod';
import type { AgentsApi } from '#/types/agents-api.types.js';
import type {
  AgentList,
  AgentScope,
  AgentWriteResult,
  VersionedAgents,
} from '#/types/agent-ui.types.js';
import type { HttpClientOptions } from '#/types/api.types.js';

const enc = encodeURIComponent;

function prefix(scope: AgentScope): string {
  return scope.kind === 'company'
    ? '/settings/agents'
    : `/settings/projects/${enc(scope.slug)}/agents`;
}

/** Reduces either scope's answer to the list shape the screens use. */
function toList(reply: VersionedAgents, id?: string): AgentWriteResult {
  const { version } = reply;
  const list: AgentList =
    typeof version === 'number'
      ? { agents: reply.agents, version, companyVersion: version }
      : {
          agents: reply.agents,
          version: version.project,
          companyVersion: version.company,
        };

  return id === undefined ? list : { ...list, id };
}

function listSchema(scope: AgentScope): z.ZodType<VersionedAgents> {
  return scope.kind === 'company' ? CompanyAgentsReply : ProjectAgentsReply;
}

export function createAgentsHttp(client: HttpClientOptions): AgentsApi {
  return {
    async list(scope, options) {
      return toList(await requestJson(client, prefix(scope), listSchema(scope), options));
    },

    async create(scope, body) {
      const reply = await requestJson(
        client,
        prefix(scope),
        scope.kind === 'company' ? CompanyAgentWriteReply : ProjectAgentWriteReply,
        {
          method: 'POST',
          body: {
            agent: AgentFields.parse(body.agent),
            origin: body.origin,
            expected_version: body.expected_version,
            reason: body.reason,
          },
        },
      );

      return toList(reply, reply.id);
    },

    async update(scope, id, body) {
      const meta = { expected_version: body.expected_version, reason: body.reason };
      const payload =
        body.kind === 'agent'
          ? { agent: AgentFields.parse(body.agent), ...meta }
          : { override: body.override, ...meta };

      return toList(
        await requestJson(client, `${prefix(scope)}/${enc(id)}`, listSchema(scope), {
          method: 'PUT',
          body: payload,
        }),
      );
    },

    async act(scope, id, action, meta) {
      const verb =
        action === 'reset' && scope.kind === 'project' ? 'reset-override' : action;

      return toList(
        await requestJson(
          client,
          `${prefix(scope)}/${enc(id)}/${verb}`,
          listSchema(scope),
          { method: 'POST', body: meta },
        ),
      );
    },

    async duplicate(source, id, body) {
      const reply = await requestJson(
        client,
        `${prefix(source)}/${enc(id)}/duplicate`,
        DuplicateReply,
        {
          method: 'POST',
          body: {
            name: body.name,
            scope: body.target.kind,
            ...(body.target.kind === 'project' ? { project: body.target.slug } : {}),
            expected_version: body.expected_version,
            reason: body.reason,
          },
        },
      );

      return toList(reply, reply.id);
    },

    async history(scope, id, options) {
      const reply = await requestJson(
        client,
        `${prefix(scope)}/${enc(id)}/history`,
        HistoryReply,
        options,
      );

      return reply.versions;
    },

    async templates(options) {
      return (await requestJson(client, '/agents/templates', TemplatesReply, options))
        .templates;
    },

    async runsOn(options) {
      return (await requestJson(client, '/agents/runs-on', RunsOnReply, options))
        .harnesses;
    },

    async tools(options) {
      const reply = await requestJson(
        client,
        '/settings/catalogue',
        CatalogueReply,
        options,
      );

      return reply.doc.entries;
    },

    draft(body, options) {
      return requestJson(client, '/agents/draft', DraftAgentOutput, {
        ...options,
        method: 'POST',
        body: {
          description: body.description,
          scope: body.scope.kind,
          ...(body.scope.kind === 'project' ? { project: body.scope.slug } : {}),
        },
      });
    },

    test(body) {
      return requestJson(client, '/agents/test', AgentTestResult, {
        method: 'POST',
        body: {
          agent: AgentFields.parse(body.agent),
          ...(body.project === undefined ? {} : { project: body.project }),
        },
      });
    },
  };
}
