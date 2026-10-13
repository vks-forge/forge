/**
 * Pins path normalisation: one canonical, case-folded, absolute-first form.
 *
 * Why: the path floors compare a Worker-chosen spelling with fixed globs. If the same
 * file can be written as `..\..\.forge\data`, `\\?\C:\...`, `.FORGE/DATA`, `.env.` or
 * `.env::$DATA` and only some spellings normalise to the floored form, the floor is
 * decoration. Dot segments must be resolved on the full absolute path before the result
 * is made relative to the cwd, so a path that climbs out of a worktree is still seen
 * as the absolute outside path it is.
 *
 * Pins: normalizePath(), absolutePath(), isInside().
 * Depends on: shared/path, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import { absolutePath, isInside, normalizePath } from '#/shared/path.js';

const WT = 'C:/work/repo/.worktrees/t1';

describe('normalizePath', () => {
  it.each([
    ['src/./a/../b.ts', undefined, 'src/b.ts'],
    ['a\\b\\c', undefined, 'a/b/c'],
    ['../x', undefined, '../x'],
    ['a/../../x', undefined, '../x'],
    ['/work/repo/src/a.ts', '/work/repo', 'src/a.ts'],
    ['/work/repo', '/work/repo/', '.'],
    ['C:\\Work\\Repo\\src\\a.ts', 'c:/work/repo', 'src/a.ts'],
    ['/work/repository/x', '/work/repo', '/work/repository/x'],
    ['/../etc', undefined, '/etc'],
    ['', undefined, '.'],
    // case folding: the Windows filesystem ignores case
    ['SRC/A.ts', undefined, 'src/a.ts'],
    // device and extended prefixes
    ['\\\\?\\C:\\work\\repo\\a', undefined, 'c:/work/repo/a'],
    ['//?/C:/work/repo/a', undefined, 'c:/work/repo/a'],
    ['\\\\.\\C:\\a', undefined, 'c:/a'],
    ['\\\\?\\UNC\\srv\\share\\a', undefined, '//srv/share/a'],
    ['\\\\srv\\share\\a', undefined, '//srv/share/a'],
    // dots resolved on the full absolute path, then relativised
    ['../../.forge/data/forge.db', WT, 'c:/work/repo/.forge/data/forge.db'],
    ['src/../../../x', WT, 'c:/work/repo/x'],
    ['src/a.ts', WT, 'src/a.ts'],
    ['C:/work/repo/.worktrees/t1/src/a.ts', WT, 'src/a.ts'],
    ['C:/WORK/REPO/.WORKTREES/T1', WT, '.'],
    ['C:/work/repo/.worktrees/t10/a', WT, 'c:/work/repo/.worktrees/t10/a'],
    ['..', WT, 'c:/work/repo/.worktrees'],
    // Windows strips trailing dots and spaces and ignores alternate data streams
    ['.env.', undefined, '.env'],
    ['.env ', undefined, '.env'],
    ['.env::$DATA', undefined, '.env'],
    ['a./b', undefined, 'a/b'],
    // drive-relative and home forms are outside the worktree
    ['C:x', WT, 'c:/x'],
    ['~/.ssh/id_rsa', WT, '/~/.ssh/id_rsa'],
    ['~backup.txt', WT, '~backup.txt'],
  ])('%j (cwd %j) -> %j', (p, cwd, expected) => {
    expect(normalizePath(p, cwd)).toBe(expected);
  });
});

describe('absolutePath and isInside', () => {
  it('resolves relative paths against the cwd without relativising', () => {
    expect(absolutePath('../x', WT)).toBe('c:/work/repo/.worktrees/x');
    expect(absolutePath('src', WT)).toBe('c:/work/repo/.worktrees/t1/src');
    expect(absolutePath('C:\\A\\..\\B', WT)).toBe('c:/b');
  });

  it('isInside is segment-wise, not a string prefix', () => {
    expect(isInside('C:/work/repo/.worktrees/t1/a', WT)).toBe(true);
    expect(isInside('C:/work/repo/.worktrees/t10/a', WT)).toBe(false);
    expect(isInside('src/a', WT)).toBe(true);
    expect(isInside('../a', WT)).toBe(false);
  });
});
