/**
 * Stub routes for the project list and for per-project settings.
 *
 * Why: the project screens' hard parts are the ones a fixed answer hides: which fields a
 *   project overrides, the new version a save creates, and the 409 when someone saved first.
 *   These routes keep a list of versions per project and merge them over the built-in
 *   defaults with core's own `mergeConfig`, so "inherited" and "overridden" mean here exactly
 *   what they mean on the server. A save with a stale `expectedVersion` fails with the same
 *   409 and code. Archiving marks the slug so the project list shows it archived, unarchiving (`status: ready`)
 *   brings it back; deleting does the same.
 *
 * `GET` / `POST /projects/:slug/detected` answer from the sample detection data; the POST also
 * records the ecosystems on the project row, so the list shows what "Detect again" found.
 *
 * Exports: projectRoutes().
 * Depends on: @forge/core (mergeConfig), helpers/fetch-stub, helpers/forge-data/*.
 */

import { mergeConfig } from '@forge/core';
import { BUILTIN_WITH_DIRECTOR } from '#tests/helpers/forge-data/director-data.js';
import type { ConfigVersion, ProjectOverride } from '@forge/core';
import { json, refusal } from '#tests/helpers/fetch-stub.js';
import type { Routes } from '#tests/helpers/fetch-stub.js';
import { detectedOf } from '#tests/helpers/forge-data/detected-data.js';
import { projectData } from '#tests/helpers/forge-data/project-data.js';
import { seedVersions } from '#tests/helpers/forge-data/project-settings-data.js';

export function projectRoutes(options: {
  empty: boolean;
  /** The company's saved versions; the last one is what projects inherit from. */
  companyHistory: readonly ConfigVersion[];
}): Routes {
  const versions = new Map<string, ConfigVersion[]>();
  const archived = new Set<string>();
  const unarchived = new Set<string>();
  const of = (slug: string): ConfigVersion[] => {
    const found = versions.get(slug) ?? seedVersions(slug);
    versions.set(slug, found);

    return found;
  };

  const company = options.companyHistory.at(-1);
  const companyDoc = (company?.doc ?? {}) as Record<string, unknown>;
  const project = (slug: string) => projectData.find((p) => p.slug === slug);
  const unknown = (slug: string) =>
    refusal(404, 'project_not_found', `no project ${slug}`);

  // "Detect again" records what it found on the project row, as the real server does.
  const recorded = new Map<string, string[]>();
  const view = (slug: string) => {
    const found = recorded.get(slug);
    const row = { ...project(slug)!, ...(found ? { ecosystems: found } : {}) };

    if (unarchived.has(slug)) {
      return { ...row, status: 'ready' as const };
    }

    return archived.has(slug) ? { ...row, status: 'archived' as const } : row;
  };

  return {
    'GET /projects': () =>
      json({ projects: options.empty ? [] : projectData.map((p) => view(p.slug)) }),

    'GET /projects/:slug/detected': ({ params }) => {
      const slug = params['slug']!;

      return project(slug) ? json(detectedOf(slug)) : unknown(slug);
    },

    'POST /projects/:slug/detected': ({ params }) => {
      const slug = params['slug']!;
      if (!project(slug)) {
        return unknown(slug);
      }

      recorded.set(slug, [...detectedOf(slug).ecosystems]);

      return json(detectedOf(slug));
    },

    'PATCH /projects/:slug': ({ params, body }) => {
      const slug = params['slug']!;
      if (!project(slug)) {
        return unknown(slug);
      }

      if ((body as { status?: string } | undefined)?.status === 'ready') {
        archived.delete(slug);
        unarchived.add(slug);
      } else {
        archived.add(slug);
      }

      return json({ project: view(slug) });
    },

    'DELETE /projects/:slug': ({ params }) => {
      const slug = params['slug']!;
      if (!project(slug)) {
        return unknown(slug);
      }

      archived.add(slug);

      return json({ deleted: slug });
    },

    'GET /settings/projects/:slug': ({ params }) => {
      const slug = params['slug']!;
      if (!project(slug)) {
        return unknown(slug);
      }

      const latest = of(slug).at(-1);

      return json({
        config: mergeConfig(
          BUILTIN_WITH_DIRECTOR,
          companyDoc,
          latest?.doc as ProjectOverride | undefined,
        ),
        version: { company: company?.version ?? 0, project: latest?.version ?? 0 },
        warnings: [],
      });
    },

    'GET /settings/projects/:slug/history': ({ params }) => {
      const slug = params['slug']!;

      return project(slug) ? json({ versions: [...of(slug)] }) : unknown(slug);
    },

    'PUT /settings/projects/:slug': ({ params, body }) => {
      const slug = params['slug']!;
      if (!project(slug)) {
        return unknown(slug);
      }

      const input = body as {
        doc: Record<string, unknown>;
        author: string;
        reason: string;
        expectedVersion: number;
      };

      const saved = of(slug);
      const current = saved.at(-1)?.version ?? 0;
      if (current !== input.expectedVersion) {
        return refusal(
          409,
          'version_conflict',
          `settings are at version ${current}, not ${input.expectedVersion}`,
        );
      }

      const next: ConfigVersion = {
        id: saved.length + 100,
        scope: 'project',
        project: slug,
        version: current + 1,
        doc: input.doc as never,
        author: input.author,
        reason: input.reason,
        created_at: Date.now(),
      };

      saved.push(next);

      return json(next);
    },
  };
}
