/**
 * Archive and unarchive a project: the one door for a project row's status.
 *
 * Why: an archived project takes no new work and is not served; the owner must be able to
 *   bring it back (d-0157). Unarchiving is not just a flag flip: the project's folder may
 *   have been moved or deleted while it was archived, and a project the registry cannot
 *   build would be "ready" yet serve nothing, so its tickets would silently park. The
 *   runtime is therefore built first; if the folder is gone or the runtime cannot be built,
 *   the project stays archived and the caller gets a plain 409 with the reason. The row is
 *   written last, and if that write fails the runtime is dropped again so the registry and
 *   the row never disagree.
 *
 * Exports: setProjectStatus().
 * Depends on: node:fs, @forge/core, services/http/http-errors, types/routes.
 *   IO: storage, settings, one existence check of the project's folder.
 */

import { existsSync } from 'node:fs';
import type { Project } from '@forge/core';
import { HttpError } from '#/services/http/http-errors.js';
import type { RouteDeps } from '#/types/routes.types.js';

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const find = (deps: RouteDeps, slug: string): Promise<Project | undefined> =>
  deps.storage.transaction(async (tx) =>
    (await tx.projects.list()).find((p) => p.slug === slug),
  );

/** Archives (`archived`) or unarchives (`ready`) `slug`; 404 unknown, 409 `project_not_servable` when it cannot be served again. */
export async function setProjectStatus(
  deps: RouteDeps,
  slug: string,
  status: 'archived' | 'ready',
): Promise<Project> {
  const found = await find(deps, slug);
  if (!found) {
    throw new HttpError(404, 'project_not_found', `no project ${slug}`);
  }

  if (status === 'archived') {
    const next: Project = { ...found, status: 'archived' };
    await deps.storage.transaction((tx) => tx.projects.upsert(next));
    deps.projects.archive(slug);

    return next;
  }

  if (found.status !== 'archived') {
    return found;
  }

  const next: Project = { ...found, status: 'ready' };
  if (!found.local_path || !existsSync(found.local_path)) {
    throw new HttpError(
      409,
      'project_not_servable',
      `the folder of ${slug} is gone (${found.local_path ?? 'no path saved'}); restore it, then unarchive`,
    );
  }

  try {
    await deps.projects.register(next, await deps.config.project(slug));
  } catch (error) {
    throw new HttpError(409, 'project_not_servable', messageOf(error));
  }

  try {
    await deps.storage.transaction((tx) => tx.projects.upsert(next));
  } catch (error) {
    deps.projects.archive(slug);

    throw error;
  }

  return next;
}
