/**
 * The `http` side of the Forge settings resources: harnesses, GitHub connections, company settings.
 *
 * Why: these screens change logins, credentials and concurrency caps, so each call must hit the
 *   exact route the server implements and parse the answer before a component sees it. This is
 *   the only place that knows the paths (`/harnesses/*`, `/github/connections`,
 *   `/settings/company*`). Credentials travel only in the request body of a write and are never
 *   part of any response schema, so no screen can show one back.
 *
 * Exports: createSettingsHttp().
 * Depends on: @forge/core (HarnessToolSchema), api/http/request-json, schemas/settings,
 *   types/api.types, types/settings-api.types.
 */

import { ConfigVersion, HarnessToolSchema } from '@forge/core';
import { requestJson } from '#/api/http/request-json.js';
import {
  CompanyView,
  CompatJob,
  CompatView,
  ConnectionReply,
  ConnectionsResponse,
  HarnessesResponse,
  HarnessTestResult,
  HarnessView,
  HistoryResponse,
  SecretStored,
  ToolsView,
} from '#/schemas/settings.js';
import type { HttpClientOptions, ResourceApis } from '#/types/api.types.js';

const harnessPath = (id: string, rest = ''): string =>
  `/harnesses/${encodeURIComponent(id)}${rest}`;

export function createSettingsHttp(
  client: HttpClientOptions,
): Pick<ResourceApis, 'harnesses' | 'github' | 'settings'> {
  return {
    harnesses: {
      list: (options) => requestJson(client, '/harnesses', HarnessesResponse, options),
      save: (id, body) =>
        requestJson(client, harnessPath(id), HarnessView, { method: 'PUT', body }),
      putSecret: (id, body) =>
        requestJson(client, harnessPath(id, '/secret'), SecretStored, {
          method: 'PUT',
          body,
        }),
      test: (id, live) =>
        requestJson(
          client,
          harnessPath(id, `/test${live ? '?live=1' : ''}`),
          HarnessTestResult,
          { method: 'POST' },
        ),
      compat: (id, options) =>
        requestJson(client, harnessPath(id, '/compat'), CompatView, options),
      runCompat: (id) =>
        requestJson(client, harnessPath(id, '/compat/run'), CompatJob, {
          method: 'POST',
        }),
      tools: (id, options) =>
        requestJson(client, harnessPath(id, '/tools'), ToolsView, options),
      decideTool: (id, tool, decision, body) =>
        requestJson(
          client,
          harnessPath(id, `/tools/${encodeURIComponent(tool)}/${decision}`),
          HarnessToolSchema,
          { method: 'POST', body },
        ),
    },
    github: {
      async list(options) {
        const body = await requestJson(
          client,
          '/github/connections',
          ConnectionsResponse,
          options,
        );

        return body.connections;
      },
      async add(body) {
        const reply = await requestJson(client, '/github/connections', ConnectionReply, {
          method: 'POST',
          body,
        });

        return reply.connection;
      },
    },
    settings: {
      company: (options) =>
        requestJson(client, '/settings/company', CompanyView, options),
      saveCompany: (body) =>
        requestJson(client, '/settings/company', ConfigVersion, { method: 'PUT', body }),
      async companyHistory(options) {
        const body = await requestJson(
          client,
          '/settings/company/history',
          HistoryResponse,
          options,
        );

        return body.versions;
      },
    },
  };
}
