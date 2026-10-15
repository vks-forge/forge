/**
 * Pins: listBranches() reports the checked-out branch and a bounded list of local branches.
 *
 * Why: the new-project form pre-selects the checked-out branch and offers the rest; a
 *   detached HEAD must not invent a current branch and a huge branch list must not flood
 *   the form. Each case runs on a throwaway repository (real git).
 *
 * Depends on: src/index, helpers/temp, node:child_process, node:fs.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { listBranches } from '#/index.js';
import { trackTemp } from '#tests/helpers/temp.js';

const run = promisify(execFile);
const git = async (cwd: string, ...args: string[]): Promise<string> =>
  (await run('git', args, { cwd, windowsHide: true })).stdout.trim();

async function makeRepo(): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'forge branches ')));
  trackTemp(dir);
  await git(dir, 'init', '-b', 'main');
  await git(dir, 'config', 'user.name', 'Tester');
  await git(dir, 'config', 'user.email', 'tester@example.com');
  await git(dir, 'config', 'commit.gpgsign', 'false');
  await writeFile(join(dir, 'README.md'), 'hello\n');
  await git(dir, 'add', '-A');
  await git(dir, 'commit', '-m', 'init');

  return dir;
}

describe('listBranches', () => {
  it('returns the checked-out branch and every local branch, alphabetical', async () => {
    const dir = await makeRepo();
    await git(dir, 'branch', 'zeta');
    await git(dir, 'branch', 'alpha');

    expect(await listBranches({ path: dir })).toEqual({
      current: 'main',
      branches: ['alpha', 'main', 'zeta'],
      truncated: false,
    });
  });

  it('has no current branch on a detached HEAD', async () => {
    const dir = await makeRepo();
    await git(dir, 'checkout', '--detach');

    const listing = await listBranches({ path: dir });

    expect(listing.current).toBeNull();
    expect(listing.branches).toEqual(['main']);
  });

  it('returns at most the limit and says it cut the list', async () => {
    const dir = await makeRepo();
    await git(dir, 'branch', 'b1');
    await git(dir, 'branch', 'b2');

    const listing = await listBranches({ path: dir, limit: 2 });

    expect(listing.branches).toEqual(['b1', 'b2']);
    expect(listing.truncated).toBe(true);
  });
});
