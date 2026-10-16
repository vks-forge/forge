/**
 * Makes one new folder inside a folder, for the folder browser's "New folder" button.
 *
 * Why: a person adding a project often wants it in a folder that does not exist yet, and the
 *   in-app browser is where they discover that. Forge runs on their own machine, so it can
 *   create the folder, but only one level, only with a name that is safe on every OS (no
 *   separators that would escape the parent, no Windows reserved names, no trailing dot or
 *   space that Windows silently drops), and never over something that exists. Anything unsafe
 *   is refused in plain words the dialog shows under the name box.
 *
 * Exports: createFolder(), validateFolderName(), MAX_FOLDER_NAME_LENGTH.
 * Depends on: node:fs/promises, node:path, services/folder-listing, services/http/http-errors,
 *   @forge/core (FolderEntry, type). IO: makes one folder.
 */

import { mkdir, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import type { FolderEntry } from '@forge/core';
import { folderEntry } from '#/services/folder-listing.js';
import { HttpError } from '#/services/http/http-errors.js';

export const MAX_FOLDER_NAME_LENGTH = 120;

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

const FORBIDDEN_CHARS = /[<>:"/\\|?*\u0000-\u001f]/;

/** The reason `name` cannot be a folder name here, or null when it can. */
export function validateFolderName(name: string): string | null {
  if (name.trim() === '') {
    return 'Give the folder a name.';
  }

  if (name.length > MAX_FOLDER_NAME_LENGTH) {
    return `Use ${MAX_FOLDER_NAME_LENGTH} characters or fewer.`;
  }

  if (name === '.' || name === '..') {
    return 'A folder cannot be called . or ..';
  }

  if (FORBIDDEN_CHARS.test(name)) {
    return 'A folder name cannot contain \\ / : * ? " < > | or control characters.';
  }

  if (RESERVED.test(name)) {
    return `${name} is a reserved name on Windows; choose another.`;
  }

  if (/[. ]$/.test(name) || name.startsWith(' ')) {
    return 'A folder name cannot start with a space or end with a space or dot.';
  }

  return null;
}

/** Creates `name` inside the existing absolute folder `parent`; refuses an existing name with 409. */
export async function createFolder(parent: string, name: string): Promise<FolderEntry> {
  if (!isAbsolute(parent)) {
    throw new HttpError(400, 'invalid_path', 'parent must be an absolute folder path');
  }

  const problem = validateFolderName(name);

  if (problem !== null) {
    throw new HttpError(400, 'invalid_folder_name', problem);
  }

  const base = resolve(parent);

  try {
    if (!(await stat(base)).isDirectory()) {
      throw new HttpError(400, 'not_a_directory', `${base} is a file, not a folder`);
    }
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(404, 'folder_not_found', `${base} does not exist`);
  }

  const path = join(base, name);

  try {
    await mkdir(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code === 'EEXIST') {
      throw new HttpError(409, 'folder_exists', `${name} already exists in ${base}`);
    }

    if (code === 'EACCES' || code === 'EPERM') {
      throw new HttpError(
        403,
        'folder_not_writable',
        `Forge is not allowed to create folders in ${base}`,
        { family: 'policy_denied' },
      );
    }

    throw error;
  }

  return folderEntry(name, path);
}
