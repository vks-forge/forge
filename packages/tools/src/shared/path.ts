/**
 * Path normalisation shared by rule matching and argv floors.
 *
 * Why: a Worker can name the same file as `src/a.ts`, `./src/../src/a.ts`,
 *   `C:\repo\src\a.ts`, `\\?\C:\repo\src\a.ts`, `SRC/A.TS`, `a.ts.` or `a.ts::$DATA`, and the
 *   Windows filesystem treats them alike. Rules and floors must see one canonical form
 *   (case-folded, forward slashes, device prefixes stripped, trailing dots and spaces and
 *   data streams dropped, dot segments resolved), or a spelling slips past a deny. Dots are
 *   resolved on the full absolute path first and only then made relative to the cwd, so a
 *   relative path that climbs out of a worktree is seen as the absolute outside path it is
 *   (and the `.forge/data` of the main checkout is matched wherever the cwd sits). Lexical
 *   only; symlinks, junctions and 8.3 short names are not resolved (tool-system.md §5.3).
 *
 * Exports: normalizePath(), absolutePath(), isInside().
 * Depends on: types/path. No IO.
 */

import type { ParsedPath as Parsed } from '#/types/path.types.js';

/** Folds case and compatibility forms, unifies slashes and drops `\\?\` / `\\.\` prefixes. */
function canon(path: string): string {
  let p = path.normalize('NFKC').replaceAll('\\', '/').toLowerCase();
  if (/^\/\/[?.]\//.test(p)) {
    p = p.slice(4);
    if (p.startsWith('unc/')) p = `//${p.slice(4)}`;
  }
  return p;
}

function splitRoot(p: string): { root: string; rest: string } {
  const drive = /^([a-z]):\/*/.exec(p);
  if (drive) return { root: `${drive[1]}:/`, rest: p.slice(drive[0].length) };
  if (p.startsWith('//')) return { root: '//', rest: p.replace(/^\/+/, '') };
  if (p.startsWith('/')) return { root: '/', rest: p.replace(/^\/+/, '') };
  // A leading `~` expands to a home directory: outside any worktree.
  if (/^~(\/|$)/.test(p)) return { root: '/', rest: p };
  return { root: '', rest: p };
}

/** Windows ignores trailing dots/spaces and `:stream` suffixes; `.` and `..` keep their meaning. */
function cleanSegment(raw: string): string {
  const noStream = raw.replace(/:.*$/, '');
  const trimmed = noStream.replace(/ +$/, '');
  if (trimmed === '.' || trimmed === '..') return trimmed;
  return trimmed.replace(/[. ]+$/, '');
}

function parse(path: string): Parsed {
  const { root, rest } = splitRoot(canon(path));
  const segments: string[] = [];
  for (const raw of rest.split('/')) {
    const seg = cleanSegment(raw);
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (segments.length > 0 && segments[segments.length - 1] !== '..') segments.pop();
      else if (root === '') segments.push('..');
    } else segments.push(seg);
  }
  return { root, segments };
}

function resolveAgainst(path: Parsed, cwd: Parsed | undefined): Parsed {
  if (path.root !== '' || cwd === undefined) return path;
  const segments: string[] = [...cwd.segments];
  for (const seg of path.segments) {
    if (seg !== '..') segments.push(seg);
    else if (segments.length > 0 && segments[segments.length - 1] !== '..')
      segments.pop();
    else if (cwd.root === '') segments.push('..');
  }
  return { root: cwd.root, segments };
}

const render = (p: Parsed): string => p.root + p.segments.join('/');

/** True when `path` is `cwd` or lies below it (same root, segment-wise prefix). */
function under(path: Parsed, cwd: Parsed): boolean {
  return (
    path.root === cwd.root &&
    path.segments.length >= cwd.segments.length &&
    cwd.segments.every((s, i) => path.segments[i] === s)
  );
}

/**
 * Canonical absolute form of `path` (relative paths are resolved against `cwd`). Without a
 * `cwd`, a relative path stays relative and may keep leading `..` segments.
 */
export function absolutePath(path: string, cwd?: string): string {
  const abs = resolveAgainst(parse(path), cwd === undefined ? undefined : parse(cwd));
  return render(abs) || '.';
}

/** True when `path` (resolved against `cwd`) is `cwd` itself or below it. */
export function isInside(path: string, cwd: string): boolean {
  const c = parse(cwd);
  return under(resolveAgainst(parse(path), c), c);
}

/**
 * Normalises a path to lowercase forward slashes with dot segments resolved on the absolute
 * path, then relative to `cwd` when it lies inside it. A path outside `cwd` stays absolute
 * (so the outside-the-worktree floors and the `**\/.forge/data` floor can see it). Symlinks
 * and junctions are not resolved (M1 path inspector).
 */
export function normalizePath(path: string, cwd?: string): string {
  const c = cwd === undefined ? undefined : parse(cwd);
  const abs = resolveAgainst(parse(path), c);
  if (c !== undefined && under(abs, c)) {
    return abs.segments.slice(c.segments.length).join('/') || '.';
  }
  return render(abs) || '.';
}
