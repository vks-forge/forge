/**
 * Relative folder schema — a path inside the repository that cannot escape it.
 *
 * Why: project settings name folders (a check's or a setup step's working directory, tool
 *   folders put on PATH) that Forge then resolves against a worktree. A drive letter, a leading
 *   slash or a `..` segment would point outside the worktree, so it is refused when settings
 *   are saved, not when a command runs.
 *
 * Exports: RelativeDir.
 * Depends on: zod. No IO.
 */

import { z } from 'zod';

/** A relative folder inside the worktree: no drive, no leading slash, no `..` segment. */
export const RelativeDir = z
  .string()
  .min(1)
  .refine(
    (p) => !/^([a-z]:)?[\\/]/i.test(p) && !p.split(/[\\/]/).includes('..'),
    'must be a relative path inside the repository',
  );
