/**
 * What Forge detects in a registered project's folder, and recording its ecosystems.
 *
 * Why: the ecosystems on the project row say what the project is made of (`node`, `python`, ...).
 *   Settings can be empty and still work because the gates detect from the diff, but the owner needs
 *   to see what Forge found, which setup steps it would run before each ticket (installs) and which
 *   checks it suggests, and a project created before ecosystems were recorded, or whose files changed
 *   (a lockfile added later), needs a way to look again without editing the database. Detection reads
 *   file names and one manifest, runs nothing from the folder, and is done by the server on the
 *   project's own path: a client could lie or omit the list (d-0176, d-0180).
 *
 * Exports: detectedFor(), refreshDetected().
 * Depends on: @forge/core (Project), @forge/gates (detectProjectAt), services/http/http-errors, types/{project-detected,routes}.
 *   IO: reads the folder, writes the project row on refresh.
 */

import type { Project } from '@forge/core';
import { detectProjectAt } from '@forge/gates';
import { HttpError } from '#/services/http/http-errors.js';
import type { DetectedView } from '#/types/project-detected.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

async function projectOf(
  deps: Pick<RouteDeps, 'storage'>,
  slug: string,
): Promise<Project> {
  const found = await deps.storage.transaction(async (tx) =>
    (await tx.projects.list()).find((p) => p.slug === slug),
  );

  if (!found) {
    throw new HttpError(404, 'project_not_found', `no project ${slug}`);
  }

  return found;
}

async function detect(project: Project): Promise<DetectedView> {
  if (!project.local_path) {
    return { ecosystems: [], checks: [], setup: [] };
  }

  const found = await detectProjectAt(project.local_path, project.repo_root);

  return { ecosystems: found.ecosystems, checks: found.checks, setup: found.setup };
}

/** Detects in the project's folder now; writes nothing. 404 for an unknown project. */
export async function detectedFor(
  deps: Pick<RouteDeps, 'storage'>,
  slug: string,
): Promise<DetectedView> {
  return detect(await projectOf(deps, slug));
}

/** Detects again and stores the ecosystems on the project row. */
export async function refreshDetected(
  deps: Pick<RouteDeps, 'storage'>,
  slug: string,
): Promise<DetectedView> {
  const project = await projectOf(deps, slug);
  const view = await detect(project);
  await deps.storage.transaction((tx) =>
    tx.projects.upsert({ ...project, ecosystems: [...view.ecosystems] }),
  );

  return view;
}
