/**
 * Reads a project's old memory repository at its last commit.
 *
 * Why: the import must see a whole, consistent state, never a write in flight, so it reads the last commit
 *   (one `git ls-tree` and one `git cat-file --batch`) and records which commit that was. The commit id is what
 *   later proves nothing landed between the verification and the deletion of the folder. A folder that is
 *   not a git repository is not imported (nothing is assumed about files that were never committed), and a
 *   repository with no commit has no records.
 *
 * Exports: readImportSource(), repoDirOf(), hasRepo(), headOf(), isCleanTree().
 * Depends on: node:fs/promises, node:path, @forge/core, shared/committed-files, shared/git, types/memory-import.
 *   IO: `git` in one project's folder.
 */

import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { InvalidInputError } from '@forge/core';
import { hasCommit, readCommittedFiles } from '#/shared/committed-files.js';
import { runGit } from '#/shared/git.js';
import type { ImportSource } from '#/types/memory-import.types.js';

const SLUG = /^[a-z][a-z0-9-]*$/;
const FOLDERS = ['decisions', 'rejected', 'proposed', 'outcomes'] as const;

/** `<rootDir>/<slug>`; a slug that is not `[a-z][a-z0-9-]*` is refused so no path can leave the root. */
export function repoDirOf(rootDir: string, slug: string): string {
  if (!SLUG.test(slug)) {
    throw new InvalidInputError(`invalid project slug ${JSON.stringify(slug)}`);
  }

  return join(rootDir, slug);
}

/** True when the folder exists and holds a `.git` entry. */
export async function hasRepo(dir: string): Promise<boolean> {
  try {
    await stat(join(dir, '.git'));

    return true;
  } catch {
    return false;
  }
}

/** The commit HEAD points at, or null for a repository with no commit. */
export async function headOf(dir: string): Promise<string | null> {
  return (await hasCommit(dir)) ? runGit(dir, ['rev-parse', 'HEAD']) : null;
}

/** True when the working tree holds nothing that is not committed. */
export async function isCleanTree(dir: string): Promise<boolean> {
  return (await runGit(dir, ['status', '--porcelain'])) === '';
}

/** The markdown files of the four memory folders at HEAD, with the commit read. */
export async function readImportSource(dir: string): Promise<ImportSource> {
  if (!(await hasRepo(dir))) {
    throw new InvalidInputError(`${dir} is not a git repository`);
  }

  const headSha = await headOf(dir);
  const files = headSha === null ? [] : await readCommittedFiles(dir, FOLDERS);

  return { headSha, files };
}
