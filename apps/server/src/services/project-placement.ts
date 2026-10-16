/**
 * Decides where a new project's repository is and starts one when the folder has none.
 *
 * Why: registering a project on any folder (d-0124) means one of three things happens to
 *   git. A folder that is a repository is used as it is. A folder with no repository gets
 *   one only if the user said how (snapshot commit or init only), and never inside another
 *   repository. A folder inside a repository needs the user to say whether the project is
 *   the whole repository or just that subfolder; Forge never guesses, and never runs a nested
 *   `git init`. The answer is a placement: the project's folder, and when it is scoped to a
 *   subfolder, the repository top and the subfolder path. Resolving it is separate from
 *   starting the repository so the route can refuse a bad request (and a duplicate folder)
 *   before anything is written to the user's folder.
 *
 * Exports: resolvePlacement(), startRepository().
 * Depends on: @forge/core, @forge/git, schemas/api, services/http/http-errors, types/project-placement. IO: reads and writes the folder through git.
 */

import { InvalidInputError } from '@forge/core';
import { SnapshotTooLargeError, initLocalRepo, inspectFolderGit } from '@forge/git';
import type { ProjectCreateBody } from '#/schemas/api.js';
import { HttpError } from '#/services/http/http-errors.js';
import type { Placement } from '#/types/project-placement.types.js';

/** The placement `body` asks for; 400 when a needed choice is missing. */
export async function resolvePlacement(
  body: Pick<ProjectCreateBody, 'local_path' | 'git_setup' | 'scope'>,
): Promise<Placement> {
  const git = await inspectFolderGit({ path: body.local_path });
  if (git.state === 'repo') {
    return { localPath: body.local_path, setup: null, git };
  }

  if (git.state === 'none') {
    if (!body.git_setup) {
      throw new HttpError(
        400,
        'git_setup_required',
        `${body.local_path} has no git repository; choose a snapshot commit or init only`,
      );
    }

    return { localPath: body.local_path, setup: body.git_setup, git };
  }

  const root = git.repo_root ?? body.local_path;
  if (!body.scope) {
    throw new HttpError(
      400,
      'scope_required',
      `${body.local_path} is inside the repository ${root}; choose the repository top or only this subfolder`,
    );
  }

  if (body.scope.mode === 'root' || git.subfolder === null) {
    return { localPath: root, setup: null, git };
  }

  return {
    localPath: body.local_path,
    repoRoot: root,
    subfolder: git.subfolder,
    setup: null,
    git,
  };
}

/** Starts the repository the placement calls for (no-op when it already has one). */
export async function startRepository(
  placement: Placement,
  branch: string,
): Promise<void> {
  if (!placement.setup) {
    return;
  }

  try {
    await initLocalRepo({
      path: placement.localPath,
      branch,
      mode: placement.setup.mode,
    });
  } catch (error) {
    if (error instanceof SnapshotTooLargeError) {
      throw new HttpError(400, 'snapshot_too_large', error.message);
    }

    if (error instanceof InvalidInputError) {
      throw new HttpError(400, 'git_init_refused', error.message);
    }

    throw error;
  }
}
