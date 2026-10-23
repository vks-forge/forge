/**
 * Subfolder scoping for a worktree path.
 *
 * Why: a project scoped to a subfolder of its repository (d-0124) gets worktrees of the whole
 *   repository, but the path handed to Workers, gates and checks is the subfolder inside it.
 *   Every manager call must map that path back to the worktree root and report changed paths
 *   in the folder's own frame, so Worker claims, receipts and the diff agree; a path outside
 *   the folder shows as `../x`, which G1 refuses.
 *
 * Exports: createScopeFrame().
 * Depends on: node:path, domain/porcelain. No IO.
 */

import { posix } from 'node:path';
import { normalizePath } from '#/domain/porcelain.js';

/** Path maths for a project scoped to `sub` (forward slashes, no outer slashes; empty when unscoped). */
export function createScopeFrame(sub: string) {
  return {
    /** The worktree root for a path that is the root itself or the scoped folder inside it. */
    rootOf(path: string): string {
      const p = normalizePath(path);
      const tail = `/${sub}`;

      return sub !== '' && p.toLowerCase().endsWith(tail.toLowerCase())
        ? p.slice(0, p.length - tail.length)
        : p;
    },

    /** The scoped folder inside a worktree root. */
    scoped: (root: string): string => (sub === '' ? root : `${root}/${sub}`),

    /** A repository-relative path in the frame of the scoped folder (`../x` when outside it). */
    inScopeFrame(p: string): string {
      if (sub === '') {
        return p;
      }

      return p.startsWith(`${sub}/`) ? p.slice(sub.length + 1) : posix.relative(sub, p);
    },
  };
}
