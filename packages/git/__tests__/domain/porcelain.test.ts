/**
 * Pins: `git worktree list --porcelain` parsing and path normalisation.
 *
 * Why: idempotent create decides "reuse, conflict or add" from this output. Misreading a
 *   detached head, a bare entry or a Windows path with spaces would either re-add an
 *   existing tree or reuse the wrong one.
 *
 * Depends on: src/domain/porcelain.
 */

import { describe, expect, it } from 'vitest';
import { normalizePath, parseWorktreeList } from '#/domain/porcelain.js';

describe('parseWorktreeList', () => {
  it('parses main, branch and detached entries, including paths with spaces', () => {
    const out = [
      'worktree C:/tmp/forge git/repo',
      `HEAD ${'a'.repeat(40)}`,
      'branch refs/heads/main',
      '',
      'worktree C:/tmp/forge git/repo/.worktrees/FRG-1',
      `HEAD ${'b'.repeat(40)}`,
      'branch refs/heads/feat/FRG-1-a',
      '',
      'worktree C:/tmp/other',
      `HEAD ${'c'.repeat(40)}`,
      'detached',
      '',
    ].join('\n');

    expect(parseWorktreeList(out)).toEqual([
      { path: 'C:/tmp/forge git/repo', head: 'a'.repeat(40), branch: 'main' },
      {
        path: 'C:/tmp/forge git/repo/.worktrees/FRG-1',
        head: 'b'.repeat(40),
        branch: 'feat/FRG-1-a',
      },
      { path: 'C:/tmp/other', head: 'c'.repeat(40), branch: null },
    ]);
  });

  it('handles CRLF output and bare entries', () => {
    const out = 'worktree /srv/repo.git\r\nbare\r\n\r\n';

    expect(parseWorktreeList(out)).toEqual([
      { path: '/srv/repo.git', head: '', branch: null },
    ]);
  });

  it('returns an empty list for empty output', () => {
    expect(parseWorktreeList('')).toEqual([]);
  });
});

describe('normalizePath', () => {
  it('uses forward slashes and drops trailing separators', () => {
    expect(normalizePath('C:\\a b\\c\\')).toBe('C:/a b/c');
  });

  it('upper-cases a Windows drive letter so comparisons are stable', () => {
    expect(normalizePath('c:/x')).toBe('C:/x');
  });

  it('leaves posix roots alone', () => {
    expect(normalizePath('/')).toBe('/');
    expect(normalizePath('/a/b')).toBe('/a/b');
  });
});
