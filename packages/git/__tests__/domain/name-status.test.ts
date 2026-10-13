/**
 * Pins: parsing of `git diff --name-status -z` output.
 *
 * Why: gates trust this parse to say which files a run added, changed, deleted or renamed.
 *   A misread rename (two paths) would shift every later entry and hide a changed file.
 *
 * Pins: plain statuses, renames with old path, copies and type changes folding into the
 *   four port statuses, names with spaces, sorted output, truncated input rejected.
 * Depends on: src/domain/name-status, vitest.
 */

import { describe, expect, it } from 'vitest';
import { parseNameStatus } from '#/domain/name-status.js';

describe('parseNameStatus', () => {
  it('parses added, modified, deleted and names with spaces, sorted', () => {
    const out = ['M', 'b b.ts', 'A', 'a.ts', 'D', 'c.ts', ''].join('\0');

    expect(parseNameStatus(out)).toEqual([
      { status: 'A', path: 'a.ts' },
      { status: 'M', path: 'b b.ts' },
      { status: 'D', path: 'c.ts' },
    ]);
  });

  it('reads a rename as two paths and folds copy and type change', () => {
    const out = [
      'R095',
      'old.ts',
      'new.ts',
      'C100',
      'x.ts',
      'y.ts',
      'T',
      't.ts',
      '',
    ].join('\0');

    expect(parseNameStatus(out)).toEqual([
      { status: 'R', path: 'new.ts', oldPath: 'old.ts' },
      { status: 'M', path: 't.ts' },
      { status: 'A', path: 'y.ts' },
    ]);
  });

  it('returns nothing for empty output and throws on truncated output', () => {
    expect(parseNameStatus('')).toEqual([]);
    expect(() => parseNameStatus('R100\0only-old')).toThrow(/malformed/);
    expect(() => parseNameStatus('M')).toThrow(/malformed/);
  });
});
