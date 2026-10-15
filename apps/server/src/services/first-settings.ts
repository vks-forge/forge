/**
 * Saves a new project's first settings version, continuing any history the slug already has.
 *
 * Why: settings versions are append-only (no delete), so a registration that failed after
 *   saving them leaves versions behind for a slug that has no project. A retry that insisted
 *   on "version 0" would be refused forever with a conflict even though nothing is wrong.
 *   The save starts at version 0 and, when told the real current version, continues from it,
 *   so the same request can simply be sent again.
 *
 * Exports: appendFirstSettings().
 * Depends on: @forge/core (ConfigVersionConflictError, ProjectOverride), schemas/api,
 *   services/http/http-errors, types/routes. IO: one or more config appends.
 */

import { ConfigVersionConflictError } from '@forge/core';
import type { ProjectOverride } from '@forge/core';
import type { ProjectCreateBody } from '#/schemas/api.js';
import { HttpError } from '#/services/http/http-errors.js';
import type { RouteDeps } from '#/types/routes.types.js';

/** Saves the project's first settings; a slug that already has versions (an earlier failed attempt) continues its history. */
export async function appendFirstSettings(
  deps: Pick<RouteDeps, 'config'>,
  body: Pick<ProjectCreateBody, 'slug' | 'author' | 'reason'>,
  doc: ProjectOverride,
): Promise<number> {
  let expectedVersion = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const saved = await deps.config.append({
        scope: 'project',
        project: body.slug,
        doc,
        author: body.author,
        reason: body.reason,
        expectedVersion,
      });

      return saved.version;
    } catch (error) {
      if (!(error instanceof ConfigVersionConflictError)) {
        throw error;
      }

      expectedVersion = error.actual;
    }
  }

  throw new HttpError(
    409,
    'settings_exist',
    `settings for ${body.slug} are being changed by another request; try again`,
  );
}
