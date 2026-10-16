/**
 * Lists the sub-folders of a folder, or the places to start from, for the folder browser.
 *
 * Why: the new-project form needs the absolute path of a clone, which a browser cannot read from
 *   a file picker. Forge runs on the person's own machine, so the server lists folders for the
 *   page. Only folder names are read (never file names or contents), hidden and system folders
 *   are left out, and a folder that cannot be read is skipped, so one locked folder never
 *   breaks the list. "Is a repository" is a `.git` stat, not a git spawn, to keep a listing of
 *   hundreds of folders cheap. Each entry carries its modified time so the browser can sort by date.
 *
 * Exports: listRoots(), listFolders(), folderEntry(), MAX_FOLDER_ENTRIES.
 * Depends on: @forge/core (FolderListing), node:fs/promises, node:os, node:path, services/http/http-errors.
 *   IO: reads folder names.
 */

import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { FolderEntry, FolderListing } from '@forge/core';
import { HttpError } from '#/services/http/http-errors.js';

/** The most sub-folders one listing returns; the rest are reported as `truncated`. */
export const MAX_FOLDER_ENTRIES = 500;

const SKIPPED_NAMES = new Set(['$recycle.bin', 'system volume information']);

const DRIVE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function modifiedAt(folder: string): Promise<string | null> {
  try {
    return (await stat(folder)).mtime.toISOString();
  } catch {
    return null;
  }
}

/** The listing row for one folder: repository mark and modified time. */
export async function folderEntry(name: string, path: string): Promise<FolderEntry> {
  const [is_repo, modified_at] = await Promise.all([hasGit(path), modifiedAt(path)]);

  return { name, path, is_repo, modified_at };
}

async function hasGit(folder: string): Promise<boolean> {
  try {
    await stat(join(folder, '.git'));

    return true;
  } catch {
    return false;
  }
}

/** The home folder first, then each drive (Windows) or `/` (elsewhere). */
export async function listRoots(): Promise<FolderListing> {
  const places: { name: string; path: string }[] = [{ name: 'Home', path: homedir() }];

  if (process.platform === 'win32') {
    const probes = await Promise.all(
      [...DRIVE_LETTERS].map(async (letter) => {
        const path = `${letter}:\\`;

        return (await isDirectory(path)) ? { name: `${letter}:`, path } : null;
      }),
    );

    places.push(...probes.filter((p): p is { name: string; path: string } => p !== null));
  } else {
    places.push({ name: '/', path: '/' });
  }

  const entries: FolderEntry[] = await Promise.all(
    places.map(async (place) => ({
      ...place,
      is_repo: await hasGit(place.path),
      modified_at: null,
    })),
  );

  return { path: '', parent: null, entries, truncated: false };
}

/** Lists the sub-folders of the absolute folder `path`; throws a plain-language `HttpError` when it cannot. */
export async function listFolders(path: string): Promise<FolderListing> {
  const folder = resolve(path);
  let dirents;

  try {
    if (!(await stat(folder)).isDirectory()) {
      throw new HttpError(400, 'not_a_directory', `${folder} is a file, not a folder`);
    }

    dirents = await readdir(folder, { withFileTypes: true });
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    const code = (error as NodeJS.ErrnoException).code;

    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw new HttpError(404, 'folder_not_found', `${folder} does not exist`);
    }

    if (code === 'EACCES' || code === 'EPERM') {
      throw new HttpError(
        403,
        'folder_not_readable',
        `Forge is not allowed to open ${folder}`,
        {
          family: 'policy_denied',
        },
      );
    }

    throw error;
  }

  const names = dirents
    .filter(
      (d) =>
        d.isDirectory() &&
        !d.name.startsWith('.') &&
        !SKIPPED_NAMES.has(d.name.toLowerCase()),
    )
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  const shown = names.slice(0, MAX_FOLDER_ENTRIES);
  const entries = await Promise.all(
    shown.map((name) => folderEntry(name, join(folder, name))),
  );

  const up = dirname(folder);

  return {
    path: folder,
    parent: up === folder ? null : up,
    entries,
    truncated: names.length > shown.length,
  };
}
