/**
 * The mock `projectSettings` resource: versioned override documents with real merge and CAS.
 *
 * Why: the settings screen's hard parts are the ones a fixed answer hides: which fields a
 *   project overrides, the new version a save creates, and the 409 when someone saved first.
 *   This keeps a session-long list of versions per project and merges them over the built-in
 *   defaults with core's own `mergeConfig`, so "inherited" and "overridden" mean here exactly
 *   what they mean on the server. A save with a stale `expectedVersion` fails with the same
 *   409 and code. Archiving marks the slug so the project list shows it archived.
 *
 * Exports: createProjectSettingsMock().
 * Depends on: @forge/core (mergeConfig, BUILTIN_CONFIG), api/api-error, api/mock/*, types/*.
 */

import { BUILTIN_CONFIG, mergeCompany, mergeConfig } from '@forge/core';
import type { ConfigVersion, ProjectOverride } from '@forge/core';
import { ApiError } from '#/api/api-error.js';
import { projectFixtures } from '#/api/mock/fixtures.js';
import {
  companyOverrideFixture,
  seedVersions,
} from '#/api/mock/project-settings-fixtures.js';
import type { MockContext } from '#/types/mock.types.js';
import type { ProjectSettingsApi } from '#/types/project-settings.types.js';

export function createProjectSettingsMock(context: MockContext): ProjectSettingsApi {
  const versions = new Map<string, ConfigVersion[]>();
  const of = (slug: string): ConfigVersion[] => {
    const found = versions.get(slug) ?? seedVersions(slug);
    versions.set(slug, found);

    return found;
  };

  async function open(slug: string, signal: AbortSignal | undefined): Promise<void> {
    await context.delay(signal);
    if (context.scenario === 'error') {
      throw new ApiError('network', 'Cannot reach the Forge server (simulated).');
    }

    if (!projectFixtures.some((p) => p.slug === slug)) {
      throw new ApiError('http', `no project ${slug}`, {
        status: 404,
        code: 'project_not_found',
      });
    }
  }

  return {
    async get(slug, options) {
      await open(slug, options?.signal);
      const saved = of(slug);
      const latest = saved.at(-1);
      const override = (latest?.doc ?? {}) as Record<string, unknown>;
      const merged = mergeConfig(
        BUILTIN_CONFIG,
        companyOverrideFixture,
        latest?.doc as ProjectOverride | undefined,
      );

      return {
        config: merged,
        version: { company: 2, project: latest?.version ?? 0 },
        warnings: [],
        versions: [...saved],
        override,
        company: mergeCompany(BUILTIN_CONFIG.forge, companyOverrideFixture),
      };
    },

    async save(request, options) {
      await open(request.slug, options?.signal);
      const saved = of(request.slug);
      const current = saved.at(-1)?.version ?? 0;
      if (current !== request.expectedVersion) {
        throw new ApiError(
          'http',
          `settings are at version ${current}, not ${request.expectedVersion}`,
          { status: 409, code: 'version_conflict' },
        );
      }

      const next: ConfigVersion = {
        id: saved.length + 100,
        scope: 'project',
        project: request.slug,
        version: current + 1,
        doc: request.doc as never,
        author: 'owner',
        reason: request.reason,
        created_at: Date.now(),
      };

      saved.push(next);

      return next;
    },

    async archive(slug, options) {
      await open(slug, options?.signal);
      context.archived.add(slug);
      const project = projectFixtures.find((p) => p.slug === slug);

      return { ...project!, status: 'archived' };
    },
  };
}
