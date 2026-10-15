/**
 * The `http` adapter: resources that have a real endpoint on the Forge server.
 *
 * Why: this is the only module that knows endpoint paths. Moving a resource from the mock to
 *   the real server means adding its method here and flipping one line in the adapter table;
 *   no screen changes. Only resources whose endpoint exists today are served (`projects`
 *   from `GET /projects`); the table refuses to start if it points at a resource missing here.
 *
 * Exports: createHttpAdapter().
 * Depends on: api/http/request-json, schemas/projects, types/api.types.
 */

import { requestJson } from '#/api/http/request-json.js';
import { createSettingsHttp } from '#/api/http/settings-http.js';
import { ProjectsResponse } from '#/schemas/projects.js';
import type { ForgeApiAdapter, HttpClientOptions } from '#/types/api.types.js';

export function createHttpAdapter(client: HttpClientOptions): ForgeApiAdapter {
  return {
    ...createSettingsHttp(client),
    projects: {
      async list(options) {
        const body = await requestJson(client, '/projects', ProjectsResponse, options);

        return body.projects;
      },
    },
  };
}
