/**
 * Path containment tests — pin which folders count as holding a file.
 *
 * Why: a search over a folder backs a `read` claim for the files under it. If `src` also held
 *   `srcs/a.ts`, or a search over `test` held `src/a.ts`, a read claim would pass on a search
 *   that never reached the file; if `.` or the worktree root held nothing, a whole-tree search
 *   would back no read at all.
 *
 * Pins: nested, sibling-prefix, dot, empty and worktree-root containers, Windows absolute paths.
 * Depends on: shared/paths.
 */

import { describe, expect, it } from 'vitest';
import { containsPath } from '#/shared/paths.js';

const WT = 'D:/work/wt';

describe('containsPath', () => {
  it.each([
    ['src', 'src/a.ts'],
    ['src/', 'src/deep/a.ts'],
    ['src/a.ts', 'src/a.ts'],
    ['.', 'src/a.ts'],
    ['', 'src/a.ts'],
    ['D:\\Work\\wt', 'src/a.ts'],
    ['D:\\Work\\wt\\src', 'src\\a.ts'],
    ['SRC', 'src/a.ts'],
  ])('%s holds %s', (container, path) => {
    expect(containsPath(container, path, WT)).toBe(true);
  });

  it.each([
    ['src', 'srcs/a.ts'],
    ['test', 'src/a.ts'],
    ['src/a.ts', 'src/a.tsx'],
    ['src/deep', 'src/a.ts'],
  ])('%s does not hold %s', (container, path) => {
    expect(containsPath(container, path, WT)).toBe(false);
  });
});
