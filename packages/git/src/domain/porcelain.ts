/**
 * Parser for `git worktree list --porcelain` and path normalisation.
 *
 * Why: idempotent `create` must know whether a ticket's path is already a worktree, on
 *   which branch, and whether the branch is checked out somewhere else. Git reports paths
 *   with forward slashes and the caller may hold backslashes or a lower-case drive letter on
 *   Windows, so every path is normalised to one style before comparing.
 *
 * Exports: parseWorktreeList(), normalizePath(), samePath().
 * Depends on: types/git-worktree. No IO.
 */

import type { ParsedWorktree } from '#/types/git-worktree.types.js';

const DRIVE_ROOT = /^[A-Za-z]:\/$/;

/** Absolute-path style used everywhere here: forward slashes, no trailing slash, upper-case drive. */
export function normalizePath(p: string): string {
  let out = p.replaceAll('\\', '/');
  while (out.length > 1 && out.endsWith('/') && !DRIVE_ROOT.test(out))
    out = out.slice(0, -1);
  return out.replace(/^[a-z]:/, (d) => d.toUpperCase());
}

/** Path equality: case-insensitive on Windows file systems, exact elsewhere. */
export function samePath(a: string, b: string): boolean {
  const x = normalizePath(a);
  const y = normalizePath(b);
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y;
}

/** Parses porcelain output (blank-line separated records) into worktree entries. */
export function parseWorktreeList(out: string): ParsedWorktree[] {
  const result: ParsedWorktree[] = [];
  for (const block of out.split(/\r?\n\r?\n/)) {
    let path: string | null = null;
    let head = '';
    let branch: string | null = null;
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('worktree '))
        path = normalizePath(line.slice('worktree '.length));
      else if (line.startsWith('HEAD ')) head = line.slice('HEAD '.length);
      else if (line.startsWith('branch ')) {
        branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
      }
    }
    if (path !== null) result.push({ path, head, branch });
  }
  return result;
}
