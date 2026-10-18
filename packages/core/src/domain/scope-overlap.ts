/**
 * Write-scope overlap — can two sets of path globs ever name the same file?
 *
 * Why: writers of one group work side by side in a single worktree, and `admit()` holds each to its
 *   own write scope. That only keeps them from stepping on each other if the scopes cannot meet:
 *   `apps/web/**` and `packages/**` cannot, `src/**` and `src/api/**` can, and so can any `**`.
 *   The test must be safe rather than clever: it says "overlap" whenever it cannot prove the two
 *   globs apart, because a false alarm costs the owner a rewording and a miss lets two writers
 *   edit the same file. Two literal paths overlap only when equal, a literal against a glob when
 *   the glob matches it, and two globs when one's literal prefix (the part before the first
 *   wildcard) starts the other's. A glob with no slash matches at any depth, so it overlaps all.
 *
 * Exports: scopesOverlap(), globsOverlap().
 * Depends on: shared/glob. No IO.
 */

import { globMatch } from '#/shared/glob.js';

const WILDCARD = /[*?[{]/;

const norm = (g: string): string => g.replaceAll('\\', '/').replace(/^\.\//, '');

/** The path before the first wildcard; a glob with no slash can match at any depth, so it has none. */
function prefixOf(glob: string): string {
  const g = norm(glob);
  if (!g.includes('/')) {
    return '';
  }

  const at = g.search(WILDCARD);

  return at < 0 ? g : g.slice(0, at);
}

/** True when two single globs can match a common path (conservatively: unsure means true). */
export function globsOverlap(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  const xLiteral = !WILDCARD.test(x);
  const yLiteral = !WILDCARD.test(y);
  if (xLiteral && yLiteral) {
    return x === y;
  }

  if (xLiteral) {
    return globMatch(y, x);
  }

  if (yLiteral) {
    return globMatch(x, y);
  }

  const px = prefixOf(x);
  const py = prefixOf(y);

  return px.startsWith(py) || py.startsWith(px);
}

/** True when any glob of `a` can meet any glob of `b`. */
export function scopesOverlap(a: readonly string[], b: readonly string[]): boolean {
  return a.some((x) => b.some((y) => globsOverlap(x, y)));
}
