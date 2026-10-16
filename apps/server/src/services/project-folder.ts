/**
 * The folder checks every project registration starts with.
 *
 * Why: `POST /projects` and the dry-run `POST /projects/inspect` must refuse a bad folder
 *   with the same code and the same words, or the new-project form would show "looks fine"
 *   for a folder the save then rejects. Keeping the checks (an absolute path to an existing folder, and not
 *   inside Forge's own data folder, where the Director's memory and Worker worktrees live)
 *   in one function is what makes inspect a true preview of create (code.md rule 6).
 *
 * Exports: assertProjectFolder().
 * Depends on: node:fs, node:path, services/http/http-errors, services/path-guard.
 */

import { statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { HttpError } from '#/services/http/http-errors.js';
import { insideForgeStorage } from '#/services/path-guard.js';

/** Throws the 400 that refuses `localPath` as a project folder; returns when it is acceptable so far. */
export function assertProjectFolder(
  dataHome: { readonly home: string; readonly worktreesDir: string },
  localPath: string,
): void {
  if (!isAbsolute(localPath)) {
    throw new HttpError(400, 'invalid_local_path', 'local_path must be an absolute path');
  }

  // Forge's own storage is never a project: its memory repositories and worktrees are what
  // the Director and Workers write, so a project there would erase the floor between them.
  if (insideForgeStorage(localPath, [dataHome.home, dataHome.worktreesDir]) !== null) {
    throw new HttpError(
      400,
      'path_in_data_home',
      "local_path is inside Forge's own data folder; choose the folder of your own project instead",
    );
  }

  let isDirectory = false;
  try {
    isDirectory = statSync(localPath).isDirectory();
  } catch {
    isDirectory = false;
  }

  if (!isDirectory) {
    throw new HttpError(400, 'not_a_directory', `${localPath} is not a folder`);
  }
}
