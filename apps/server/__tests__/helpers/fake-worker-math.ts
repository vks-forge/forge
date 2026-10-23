/**
 * The code the fake Worker writes into the fixture project's `src/math.js` and its test.
 *
 * Why: a ticket that starts after another one merged starts from a base that already has `add`
 *   (worktrees are cut from the host's fetched base, so later tickets build on earlier ones). The fake
 *   must then add a second function, not the same one again, or the project would no longer parse and
 *   its gate would fail for a reason that has nothing to do with what the scenario pins.
 *
 * Exports: ADD(), ADD_TEST(), baseHasAdd().
 * Depends on: node:child_process. IO: runs git in the worktree.
 */

import { execFileSync } from 'node:child_process';

export const ADD = (fn: string): string => `
export function ${fn}(a, b) {
  return a + b;
}
`;

export const ADD_TEST = (fn: string, name: string): string => `
test('${name}', () => {
  assert.equal(${fn}(1, 2), 3);
});
`;

/** Whether the worktree's branch tip (before this run's edits) already has `add`. */
export function baseHasAdd(cwd: string): boolean {
  try {
    return execFileSync('git', ['show', 'HEAD:./src/math.js'], {
      cwd,
      encoding: 'utf8',
    }).includes('function add(');
  } catch {
    return false;
  }
}
