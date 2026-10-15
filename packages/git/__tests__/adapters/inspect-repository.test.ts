/**
 * Pins: inspectRepository() tells a usable clone from the folders a user may pick by mistake.
 *
 * Why: registering a project on a folder that is not a repository, a subfolder of one, or a
 *   clone without the base branch would only fail later inside worktree creation. Each
 *   case runs on a throwaway repository in the OS temp dir (real git, a path with spaces).
 *
 * Depends on: src/index, helpers/temp, node:child_process, node:fs.
 */

import { execFile } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { inspectRepository } from '#/index.js';
import { trackTemp } from '#tests/helpers/temp.js';

const run = promisify(execFile);
const git = async (cwd: string, ...args: string[]): Promise<string> =>
  (await run('git', args, { cwd, windowsHide: true })).stdout.trim();

async function makeRepo(): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'forge inspect ')));
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

describe('inspectRepository', () => {
  it('accepts a clone root with its base branch and returns the base commit', async () => {
    const dir = await makeRepo();
    const result = await inspectRepository({ path: dir, baseBranch: 'main' });

    expect(result).toEqual({ ok: true, baseSha: await git(dir, 'rev-parse', 'main') });
  });

  it('refuses a folder that does not exist, and a plain file path', async () => {
    const dir = await makeRepo();

    expect(
      await inspectRepository({ path: join(dir, 'nope'), baseBranch: 'main' }),
    ).toMatchObject({
      ok: false,
      code: 'not_a_directory',
    });

    expect(
      await inspectRepository({ path: join(dir, 'README.md'), baseBranch: 'main' }),
    ).toMatchObject({ ok: false, code: 'not_a_directory' });
  });

  it('refuses a folder that is not a repository', async () => {
    const dir = trackTemp(await realpath(await mkdtemp(join(tmpdir(), 'forge plain '))));

    expect(await inspectRepository({ path: dir, baseBranch: 'main' })).toMatchObject({
      ok: false,
      code: 'not_a_repository',
    });
  });

  it('refuses a subfolder of a repository and names the root', async () => {
    const dir = await makeRepo();
    const sub = join(dir, 'packages', 'a');
    await mkdir(sub, { recursive: true });

    const result = await inspectRepository({ path: sub, baseBranch: 'main' });

    expect(result).toMatchObject({ ok: false, code: 'not_repository_root' });
    expect(result.ok ? '' : result.message).toContain('choose the root folder');
  });

  it('refuses a clone that has no such base branch', async () => {
    const dir = await makeRepo();

    expect(await inspectRepository({ path: dir, baseBranch: 'develop' })).toMatchObject({
      ok: false,
      code: 'base_branch_missing',
    });
  });

  it('rejects a base branch that git could read as an option', async () => {
    const dir = await makeRepo();

    await expect(inspectRepository({ path: dir, baseBranch: '--all' })).rejects.toThrow(
      /must not start with/,
    );
  });

  it('accepts the clone root when the user names it through a symlink or junction', async () => {
    const dir = await makeRepo();
    const holder = trackTemp(
      await realpath(await mkdtemp(join(tmpdir(), 'forge link '))),
    );

    const link = join(holder, 'clone-link');
    await symlink(dir, link, 'junction');

    const result = await inspectRepository({ path: link, baseBranch: 'main' });

    expect(result).toMatchObject({ ok: true });
  });

  it.runIf(process.platform === 'win32')(
    'accepts the clone root when the user names it by its 8.3 short name',
    async () => {
      const dir = await makeRepo();
      const script = `(New-Object -ComObject Scripting.FileSystemObject).GetFolder('${dir}').ShortPath`;
      const short = execFileSync('powershell', ['-NoProfile', '-Command', script], {
        encoding: 'utf8',
        windowsHide: true,
      }).trim();

      const result = await inspectRepository({ path: short, baseBranch: 'main' });

      expect(result).toMatchObject({ ok: true });
    },
  );
});
