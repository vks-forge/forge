/**
 * The `projectSettings` resource served by the real Forge server.
 *
 * Why: one screen needs the project's merged settings, its saved override documents and the
 *   company settings it inherits from, and they must describe the same moment. This reads the
 *   three endpoints together and derives "what this project overrides" from the newest saved
 *   document, so the page never has to guess which values are its own. Saving sends the
 *   version the editor was looking at; the server refuses with 409 if someone saved first.
 *
 * Exports: createProjectSettingsHttp().
 * Depends on: api/http/request-json, schemas/project-settings, schemas/projects, types/*.
 */

import { requestJson } from '#/api/http/request-json.js';
import {
  ArchiveResponse,
  CompanyConfigResponse,
  ConfigHistoryResponse,
  DeleteResponse,
  ProjectConfigResponse,
  SavedVersion,
} from '#/schemas/project-settings.js';
import { OWNER } from '#/domain/owner.js';
import type { HttpClientOptions } from '#/types/api.types.js';
import type { ProjectSettingsApi } from '#/types/project-settings.types.js';

export function createProjectSettingsHttp(client: HttpClientOptions): ProjectSettingsApi {
  return {
    async get(slug, options) {
      const [config, history, company] = await Promise.all([
        requestJson(client, `/settings/projects/${slug}`, ProjectConfigResponse, options),
        requestJson(
          client,
          `/settings/projects/${slug}/history`,
          ConfigHistoryResponse,
          options,
        ),
        requestJson(client, '/settings/company', CompanyConfigResponse, options),
      ]);

      const current = history.versions.find((v) => v.version === config.version.project);

      return {
        config: config.config,
        version: config.version,
        warnings: config.warnings ?? [],
        versions: history.versions,
        override: (current?.doc ?? {}) as Record<string, unknown>,
        company: company.config,
      };
    },

    save(request, options) {
      return requestJson(client, `/settings/projects/${request.slug}`, SavedVersion, {
        ...options,
        method: 'PUT',
        body: {
          doc: request.doc,
          author: OWNER,
          reason: request.reason,
          expectedVersion: request.expectedVersion,
        },
      });
    },

    async archive(slug, options) {
      const body = await requestJson(client, `/projects/${slug}`, ArchiveResponse, {
        ...options,
        method: 'PATCH',
        body: { status: 'archived' },
      });

      return body.project;
    },

    async remove(slug, confirm, options) {
      await requestJson(client, `/projects/${slug}`, DeleteResponse, {
        ...options,
        method: 'DELETE',
        body: { confirm },
      });
    },
  };
}
