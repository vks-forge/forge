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
 *   `scopeWithin` asks the narrower question a substitute writer needs: is every path the inner scope allows
 *   also allowed by the outer one? It answers yes only when it can prove it (the same glob, a literal path the
 *   outer glob matches, or an inner glob under an outer `.../**` folder).
 *
 * Exports: scopesOverlap(), globsOverlap(), scopeWithin().
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

/** The folder an outer `.../**` glob covers (with its trailing slash), or null when the glob is not of that shape. */
function folderOf(glob: string): string | null {
  const g = norm(glob);
  if (g === '**') {
    return '';
  }

  return g.endsWith('/**') && !WILDCARD.test(g.slice(0, -2)) ? g.slice(0, -2) : null;
}

/** True when everything `inner` can match is provably matched by `outer`. */
function globWithin(inner: string, outer: string): boolean {
  const i = norm(inner);
  const o = norm(outer);
  if (i === o) {
    return true;
  }

  if (!WILDCARD.test(i)) {
    return globMatch(o, i);
  }

  const folder = folderOf(o);
  if (folder === null) {
    return false;
  }

  // A glob with no slash can match at any depth, so only the whole tree (`**`) covers it.
  return i.includes('/') ? prefixOf(i).startsWith(folder) : folder === '';
}

/**
 * True when every path allowed by `inner` is allowed by `outer` (conservative: unsure means false).
 * An empty inner scope allows nothing, so it is within anything.
 */
export function scopeWithin(inner: readonly string[], outer: readonly string[]): boolean {
  return inner.every((i) => outer.some((o) => globWithin(i, o)));
}
