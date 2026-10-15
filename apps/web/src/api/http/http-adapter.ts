/**
 * The `http` adapter: resources that have a real endpoint on the Forge server.
 *
 * Why: this is the only module that knows endpoint paths (tickets, interactions, the run
 *   event stream and chat intake included). Moving a resource from the mock to
 *   the real server means adding its method here and flipping one line in the adapter table;
 *   no screen changes. Only resources whose endpoint exists today are served (`projects`
 *   from `GET /projects`); the table refuses to start if it points at a resource missing here.
 *
 * Exports: createHttpAdapter().
 * Depends on: @forge/core (TicketListPage), api/http/request-json, api/sse/watch-run-events,
 *   schemas/projects, schemas/tickets, types/api.types.
 */

import { createMemoryHttp } from '#/api/http/memory-http.js';
import { createProjectSettingsHttp } from '#/api/http/project-settings-http.js';
import { requestJson } from '#/api/http/request-json.js';
import { createSettingsHttp } from '#/api/http/settings-http.js';
import { TicketListPage } from '@forge/core';
import { watchRunEvents } from '#/api/sse/watch-run-events.js';
import { ProjectsResponse } from '#/schemas/projects.js';
import { AnswerReply, IngestReply, TicketDetail } from '#/schemas/tickets.js';
import type {
  ForgeApiAdapter,
  HttpClientOptions,
  TicketListParams,
} from '#/types/api.types.js';

/** `?limit=&cursor=&state=a,b` for the ticket list; absent options add nothing. */
function ticketQuery(params: TicketListParams): string {
  const query = new URLSearchParams();
  if (params.limit !== undefined) {
    query.set('limit', String(params.limit));
  }

  if (params.cursor !== undefined) {
    query.set('cursor', params.cursor);
  }

  if (params.state && params.state.length > 0) {
    query.set('state', params.state.join(','));
  }

  const text = query.toString();

  return text === '' ? '' : `?${text}`;
}

export function createHttpAdapter(client: HttpClientOptions): ForgeApiAdapter {
  return {
    ...createSettingsHttp(client),
    memory: createMemoryHttp(client),
    projectSettings: createProjectSettingsHttp(client),
    projects: {
      async list(options) {
        const body = await requestJson(client, '/projects', ProjectsResponse, options);

        return body.projects;
      },
    },
    tickets: {
      list: (params, options) =>
        requestJson(
          client,
          `/projects/${encodeURIComponent(params.slug)}/tickets${ticketQuery(params)}`,
          TicketListPage,
          options,
        ),
      get: (id, options) =>
        requestJson(client, `/tickets/${encodeURIComponent(id)}`, TicketDetail, options),
    },
    interactions: {
      answer: (id, answer, options) =>
        requestJson(
          client,
          `/interactions/${encodeURIComponent(id)}/answer`,
          AnswerReply,
          { ...options, method: 'POST', body: { answer } },
        ),
    },
    runEvents: {
      watch: (watch) =>
        watchRunEvents({
          ...watch,
          baseUrl: client.baseUrl,
          ...(client.fetch ? { fetch: client.fetch } : {}),
        }),
    },
    intake: {
      chat: (input, options) =>
        requestJson(client, '/intake', IngestReply, {
          ...options,
          method: 'POST',
          body: {
            source: 'chat',
            kind: 'new_request',
            dedupe_key: input.dedupeKey,
            actor: { type: 'user', id: 'web' },
            project: input.projectId,
            payload: { text: input.text },
            received_at: new Date().toISOString(),
          },
        }),
    },
  };
}
