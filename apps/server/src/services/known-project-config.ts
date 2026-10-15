/**
 * Config source that only answers for registered projects.
 *
 * Why: the stored settings are keyed by project slug, and a slug with no saved row reads as
 *   "built-in defaults, version 0". For a slug that is not in the registry that answer is a
 *   lie: a typo in a caller (or a project that was removed) would quietly run on defaults and
 *   record runs under `p0`. Every read of a project's settings or history goes through the
 *   `projects` table first, and an unknown slug is a typed `ProjectNotFoundError` the caller
 *   reports. Company reads and every write pass through unchanged (the projects API checks
 *   the registry itself before it saves).
 *
 * Exports: withKnownProjects().
 * Depends on: @forge/core (ConfigSource, StorageAdapter, ProjectNotFoundError). IO: reads storage.
 */

import { ProjectNotFoundError } from '@forge/core';
import type { ConfigSource, StorageAdapter } from '@forge/core';

/** `source`, except `project()` and a project-scope `history()` refuse slugs missing from `storage`. */
export function withKnownProjects(
  source: ConfigSource,
  storage: StorageAdapter,
): ConfigSource {
  const require = async (slug: string): Promise<void> => {
    const known = await storage.transaction(async (tx) =>
      (await tx.projects.list()).some((p) => p.slug === slug),
    );

    if (!known) {
      throw new ProjectNotFoundError(slug);
    }
  };

  return {
    company: () => source.company(),
    append: (input) => source.append(input),
    async project(slug) {
      await require(slug);

      return source.project(slug);
    },
    async history(scope, project) {
      if (scope === 'project' && project !== undefined) {
        await require(project);
      }

      return source.history(scope, project);
    },
  };
}
