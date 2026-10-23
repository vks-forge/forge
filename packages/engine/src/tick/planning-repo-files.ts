/**
 * Planning repo files: the tracked paths a survey is shown before it reads anything.
 *
 * Why: a survey that cannot see what the repository holds answers from the card text alone, and
 *   the grill then asks the owner what the code would have told it (T2 in the eval). The list
 *   is the same git-tracked-at-HEAD view the reads use, asked through `admit()` like any other
 *   Director read, capped so a big repository cannot blow the context. The survey guard also
 *   uses it to know whether "I read nothing" is honest (a project with no tracked file has
 *   nothing to read).
 *
 * Exports: REPO_FILES_CAP, repoFilesOf().
 * Depends on: @forge/tools (admitDirectorRead), types/card-planning. Reads through the repo reader port.
 */

import { admitDirectorRead } from '@forge/tools';
import type { ReadCtx, RepoFilesList } from '#/types/card-planning.types.js';

/** Most paths a survey is shown. */
export const REPO_FILES_CAP = 400;

/** The tracked paths at HEAD, capped; empty when there is no folder, no repository, or `admit()` or git refuses. */
export async function repoFilesOf(pc: ReadCtx): Promise<RepoFilesList> {
  const none: RepoFilesList = { paths: [], truncated: false };
  if (pc.root === null) {
    return none;
  }

  const verdict = admitDirectorRead({ op: 'glob', pattern: '**' }, pc.root);
  if (verdict.decision !== 'allow') {
    return none;
  }

  try {
    const all = await pc.ctx.deps.repoReader.listTracked(pc.root, '**');

    return {
      paths: all.slice(0, REPO_FILES_CAP),
      truncated: all.length > REPO_FILES_CAP,
    };
  } catch {
    return none;
  }
}
