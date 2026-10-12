/**
 * Path normalisation shared by rule matching and argv floors.
 *
 * Why: a Worker can name the same file as `src/a.ts`, `./src/../src/a.ts`,
 *   `C:\repo\src\a.ts` or an absolute path inside its worktree. Rules and floors must
 *   see one canonical form, or a `..` or a Windows spelling slips past a deny. Lexical
 *   only; symlinks and junctions are not resolved (tool-system.md §5.3).
 *
 * Exports: normalizePath().
 * Depends on: No IO.
 */

/**
 * Lexically normalises a path to forward slashes with `.` and `..` resolved, relative to
 * `cwd` when it lies inside it. Symlinks and junctions are not resolved (M1 path inspector).
 */
export function normalizePath(path: string, cwd?: string): string {
  let p = path.normalize('NFC').replaceAll('\\', '/');
  if (cwd !== undefined) {
    const c = cwd.normalize('NFC').replaceAll('\\', '/').replace(/\/+$/, '');
    if (p.toLowerCase() === c.toLowerCase()) p = '.';
    else if (p.toLowerCase().startsWith(`${c.toLowerCase()}/`)) p = p.slice(c.length + 1);
  }
  const root = /^[A-Za-z]:\//.test(p) ? p.slice(0, 3) : p.startsWith('/') ? '/' : '';
  const parts: string[] = [];
  for (const seg of p.slice(root.length).split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length > 0 && parts[parts.length - 1] !== '..') parts.pop();
      else if (root === '') parts.push('..');
    } else parts.push(seg);
  }
  const rest = parts.join('/');
  return root + rest === '' ? '.' : root + rest;
}
