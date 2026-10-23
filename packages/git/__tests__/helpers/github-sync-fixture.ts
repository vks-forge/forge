/**
 * Git side of a GitHub host test: a bare "github" remote on disk and the local repository it fetches into.
 *
 * Why: `syncBase` on the GitHub host runs a real `git fetch` against `<gitBase>/<owner>/<repo>.git`.
 *   The fake GitHub server only speaks the REST API, so the fetch needs a real repository
 *   somewhere git can reach without a network: a bare repo at `<root>/o/r.git`, with `gitBase`
 *   pointed at `<root>`. A clone plays the user's local repository.
 *
 * Exports: GitHubSyncFixture, makeGitHubSyncFixture().
 * Depends on: helpers/local-remote, node:fs/promises, node:path.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { git, makeLocalRemote } from '#tests/helpers/local-remote.js';

export interface GitHubSyncFixture {
  /** Value for the host's `gitBase` option. */
  readonly gitBase: string;
  /** Value for the host's `localRepo` option. */
  readonly localRepo: string;
  /** Commits on the remote's main behind the host's back and returns the new tip. */
  advanceBase(): Promise<string>;
  resolveRef(ref: string): Promise<string | null>;
  cleanup(): Promise<void>;
}

export async function makeGitHubSyncFixture(): Promise<GitHubSyncFixture> {
  const r = await makeLocalRemote();
  const remote = join(r.root, 'o', 'r.git');
  await mkdir(join(r.root, 'o'));
  await git(r.root, 'clone', '--bare', r.remotePath, remote);
  const localRepo = join(r.root, 'local');
  await git(r.root, 'clone', r.remotePath, localRepo);
  let n = 0;

  return {
    gitBase: r.root.replaceAll('\\', '/'),
    localRepo,
    async advanceBase() {
      n += 1;
      await writeFile(join(r.work, `advance-${n}.txt`), `${n}\n`);
      await git(r.work, 'add', '-A');
      await git(r.work, 'commit', '-m', `advance ${n}`);
      await git(r.work, 'push', remote, 'main:main');

      return git(r.work, 'rev-parse', 'HEAD');
    },
    async resolveRef(ref) {
      try {
        return await git(localRepo, 'rev-parse', '--verify', '--quiet', ref);
      } catch {
        return null;
      }
    },
    cleanup: r.cleanup,
  };
}
