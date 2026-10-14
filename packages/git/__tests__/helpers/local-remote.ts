/**
 * Throwaway bare remote plus a working clone, for local GitHost tests.
 *
 * Why: the local-bare host needs a real bare repository and real branches pushed through
 *   it. This builds one in the OS temp dir (path with a space, like the worktree tests, to
 *   catch quoting bugs on Windows), with a `main` branch already on the remote and a clone
 *   from which test branches are committed and pushed through the host under test.
 *
 * Exports: makeLocalRemote(), LocalRemote.
 * Depends on: node:child_process, node:fs/promises, node:os, node:path.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { removeTree, trackTemp } from '#tests/helpers/temp.js';

const run = promisify(execFile);
const IDENTITY = {
  GIT_AUTHOR_NAME: 'Tester',
  GIT_AUTHOR_EMAIL: 'tester@example.com',
  GIT_COMMITTER_NAME: 'Tester',
  GIT_COMMITTER_EMAIL: 'tester@example.com',
};

/** Runs git in `cwd` and returns trimmed stdout. */
export const git = async (cwd: string, ...args: string[]): Promise<string> =>
  (
    await run('git', ['-c', 'commit.gpgsign=false', ...args], {
      cwd,
      windowsHide: true,
      // Identity through the environment: fewer spawns than `git config` per repo.
      env: { ...process.env, ...IDENTITY },
    })
  ).stdout.trim();

export interface LocalRemote {
  readonly root: string;
  /** The bare repository (the "remote"). */
  readonly remotePath: string;
  /** A clone of it, checked out on main. */
  readonly work: string;
  /** Commits `file` with `content` on a new branch cut from main (not pushed), returns its sha, and returns to main. */
  commitOnBranch(branch: string, file: string, content: string): Promise<string>;
  /** Commits on main in the clone and pushes it, moving the remote's main. */
  commitOnMain(file: string, content: string): Promise<string>;
  /** Sha of `refs/heads/<branch>` in the bare repo, or null. */
  remoteSha(branch: string): Promise<string | null>;
  cleanup(): Promise<void>;
}

export async function makeLocalRemote(): Promise<LocalRemote> {
  const root = trackTemp(await realpath(await mkdtemp(join(tmpdir(), 'forge host '))));
  const remotePath = join(root, 'remote.git');
  const work = join(root, 'work');
  await mkdir(remotePath);
  await git(remotePath, 'init', '--bare', '-b', 'main');
  await mkdir(work);
  await git(work, 'init', '-b', 'main');
  await writeFile(join(work, 'README.md'), 'hello\n');
  await git(work, 'add', '-A');
  await git(work, 'commit', '-m', 'init');
  await git(work, 'push', remotePath, 'main:main');

  const commit = async (file: string, content: string, msg: string): Promise<string> => {
    await mkdir(join(work, file, '..'), { recursive: true });
    await writeFile(join(work, file), content);
    await git(work, 'add', '-A');
    await git(work, 'commit', '-m', msg);

    return git(work, 'rev-parse', 'HEAD');
  };

  return {
    root,
    remotePath,
    work,
    async commitOnBranch(branch, file, content) {
      await git(work, 'checkout', '-b', branch, 'main');
      const sha = await commit(file, content, `work on ${branch}`);
      await git(work, 'checkout', 'main');

      return sha;
    },
    async commitOnMain(file, content) {
      const sha = await commit(file, content, `main ${file}`);
      await git(work, 'push', remotePath, 'main:main');

      return sha;
    },
    async remoteSha(branch) {
      try {
        return await git(
          remotePath,
          'rev-parse',
          '--verify',
          '--quiet',
          `refs/heads/${branch}`,
        );
      } catch {
        return null;
      }
    },
    cleanup: () => removeTree(root),
  };
}
