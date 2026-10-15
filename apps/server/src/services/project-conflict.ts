/**
 * Whether a new project clashes with one already registered.
 *
 * Why: a project's slug keys its settings and memory, its prefix numbers its tickets
 *   (`<PREFIX>-<n>`), and its folder is where Workers cut worktrees. Two projects sharing any
 *   of them would overwrite each other's settings, collide on ticket ids or fight over one
 *   clone. The check is a pure function over the registered rows so the create route can run it
 *   twice: once up front for a fast, clear refusal, and once inside the transaction that saves
 *   the row, where no other request can slip in between the read and the write.
 *
 * Exports: projectConflict().
 * Depends on: node:path, @forge/core (Project), services/http/http-errors. No IO.
 */

import { resolve } from 'node:path';
import type { Project } from '@forge/core';
import { HttpError } from '#/services/http/http-errors.js';

const samePath = (a: string, b: string): boolean =>
  process.platform === 'win32'
    ? resolve(a).toLowerCase() === resolve(b).toLowerCase()
    : resolve(a) === resolve(b);

/** The 409 that refuses `wanted` because a registered project holds its slug, prefix or folder; null when none does. */
export function projectConflict(
  existing: readonly Project[],
  wanted: { slug: string; prefix: string; local_path?: string | undefined },
): HttpError | null {
  if (existing.some((p) => p.slug === wanted.slug)) {
    return new HttpError(409, 'project_exists', `project ${wanted.slug} already exists`);
  }

  if (existing.some((p) => p.prefix === wanted.prefix)) {
    return new HttpError(
      409,
      'prefix_in_use',
      `ticket prefix ${wanted.prefix} belongs to another project; ticket ids would collide`,
    );
  }

  const path = wanted.local_path;
  if (path && existing.some((p) => p.local_path && samePath(p.local_path, path))) {
    return new HttpError(409, 'path_in_use', 'another project already uses this folder');
  }

  return null;
}
