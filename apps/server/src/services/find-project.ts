/**
 * Looks a project up by slug inside a transaction, or answers 404.
 *
 * Why: every `/projects/:slug/...` read must treat an unregistered slug as "no such project"
 *   (404), never as an empty list, or a typo in the URL would look like a project with
 *   nothing in it. One helper keeps the status and the error code the same on every route.
 *
 * Exports: findProject().
 * Depends on: @forge/core (StorageTx, Project), services/http/http-errors. IO: reads storage.
 */

import type { Project, StorageTx } from '@forge/core';
import { HttpError } from '#/services/http/http-errors.js';

/** The registered project with this slug (archived ones included), or a 404 `HttpError`. */
export async function findProject(tx: StorageTx, slug: string): Promise<Project> {
  const project = (await tx.projects.list()).find((p) => p.slug === slug);
  if (!project) {
    throw new HttpError(404, 'project_not_found', `no project ${slug}`);
  }

  return project;
}
