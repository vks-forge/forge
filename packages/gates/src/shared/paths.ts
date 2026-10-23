/**
 * Path comparison helpers.
 *
 * Why: the same file is named three ways: the Worker's claim (`src\a.ts`), the receipt
 *   resource (policy-normalised, lower-cased, relative to the worktree when inside it)
 *   and git's diff (`src/A.ts`). Claims only match evidence if all three are folded to
 *   one form first, and Windows paths are case-insensitive, so the fold lower-cases.
 *
 * Exports: foldPath(), samePath(), containsPath().
 * Depends on: none. No IO.
 */

/** Folds slashes, case and a leading `./`; strips the worktree prefix from absolute paths. */
export function foldPath(path: string, worktreePath?: string): string {
  let p = path.replaceAll('\\', '/').toLowerCase();
  if (worktreePath !== undefined) {
    const root = worktreePath.replaceAll('\\', '/').toLowerCase().replace(/\/+$/, '');
    if (p.startsWith(`${root}/`)) {
      p = p.slice(root.length + 1);
    }
  }

  while (p.startsWith('./')) {
    p = p.slice(2);
  }

  return p;
}

export function samePath(a: string, b: string, worktreePath?: string): boolean {
  return foldPath(a, worktreePath) === foldPath(b, worktreePath);
}

/**
 * True when `container` is `path` itself or a folder holding it (folded). `.`, an empty
 * path and the worktree root hold everything; `src` holds `src/a.ts` but not `srcs/a.ts`.
 */
export function containsPath(
  container: string,
  path: string,
  worktreePath?: string,
): boolean {
  const folder = foldPath(container, worktreePath).replace(/\/+$/, '');
  const wanted = foldPath(path, worktreePath);
  const root =
    worktreePath === undefined ? undefined : foldPath(worktreePath).replace(/\/+$/, '');

  if (folder === '' || folder === '.' || folder === root) {
    return true;
  }

  return wanted === folder || wanted.startsWith(`${folder}/`);
}
