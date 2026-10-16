/**
 * Scope check tests: a change outside the project folder must fail the gate.
 *
 * Why: a project scoped to a subfolder of a repository (d-0124) must never merge edits to
 *   the rest of that repository. The worktree manager reports such edits as `../x`; this
 *   pins that every shape of one (edit, add, delete, rename source) is refused while
 *   in-folder changes and whole-repository projects are untouched.
 *
 * Pins: `../x` files fail with a finding naming the path; renames out of the folder fail;
 *   in-folder paths (including a file called `..foo`) pass.
 * Depends on: domain/scope-check, helpers/fixtures.
 */

import { describe, expect, it } from 'vitest';
import { checkScope } from '#/domain/scope-check.js';
import { diffOf } from '#tests/helpers/fixtures.js';

describe('checkScope', () => {
  it('passes when every change is inside the folder', () => {
    const out = checkScope(
      diffOf([
        { status: 'M', path: 'src/a.ts' },
        { status: 'A', path: '..foo' },
      ]),
    );

    expect(out.status).toBe('passed');
    expect(out.findings).toEqual([]);
  });

  it('fails each path that leaves the folder and names it', () => {
    const out = checkScope(
      diffOf([
        { status: 'M', path: '../other/x.ts' },
        { status: 'A', path: '../y.txt' },
        { status: 'R', path: 'src/b.ts', oldPath: '../old.ts' },
      ]),
    );

    expect(out.status).toBe('failed');
    expect(out.findings.map((f) => f.message.split(':')[0])).toEqual([
      '../old.ts',
      '../other/x.ts',
      '../y.txt',
    ]);
  });
});
