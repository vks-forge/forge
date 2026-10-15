/**
 * Reads markdown files as they are in the last commit, never the working tree.
 *
 * Why: a memory write is several file steps before its one commit, so the working tree is
 *   briefly torn (an old decision already marked superseded, its successor not written
 *   yet). A Director tick that read the tree then could see neither as active and plan
 *   against nothing. The last commit is always a whole, consistent state; this reads it
 *   with one `git ls-tree` and one `git cat-file --batch`.
 *
 * Exports: readCommittedFiles(), hasCommit().
 * Depends on: shared/git, types/git.
 */

import { readBlobs, runGit } from '#/shared/git.js';
import type { CommittedFile } from '#/types/git.types.js';

/** True when `repoDir` has at least one commit on HEAD. */
export async function hasCommit(repoDir: string): Promise<boolean> {
  try {
    await runGit(repoDir, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']);

    return true;
  } catch {
    return false;
  }
}

/** Markdown files at HEAD under the given top-level folders, sorted by path. No commit reads as empty. */
export async function readCommittedFiles(
  repoDir: string,
  folders: readonly string[],
): Promise<CommittedFile[]> {
  if (!(await hasCommit(repoDir))) {
    return [];
  }

  const listing = await runGit(repoDir, [
    'ls-tree',
    '-r',
    '-z',
    'HEAD',
    '--',
    ...folders,
  ]);

  const entries = listing
    .split('\0')
    .map((line) => /^100(?:644|755) blob ([0-9a-f]+)\t(.+)$/s.exec(line))
    .filter((m): m is RegExpExecArray => m !== null && m[2]?.endsWith('.md') === true)
    .map((m) => ({ oid: m[1] ?? '', relPath: m[2] ?? '' }))
    .sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));

  const blobs = await readBlobs(
    repoDir,
    entries.map((e) => e.oid),
  );

  return entries.map((e, i) => ({
    relPath: e.relPath,
    text: blobs[i]?.toString('utf8') ?? '',
  }));
}
