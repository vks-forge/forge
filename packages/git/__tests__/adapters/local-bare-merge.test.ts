/**
 * Pins: the local bare-repo host merges only what the gates judged, and only once.
 *
 * Why: the end-to-end fixture trusts this host to behave like GitHub offline. A merge of a
 * branch that moved after the gates passed would ship unchecked code; a base that moved
 * during a merge and was overwritten would lose someone's commit; a crash between moving
 * the base and saving the PR record must not leave a PR that merges a second time as an
 * empty commit; and a PR whose branch is gone must read as missing, not as open (d-0062).
 *
 * Pins: head-sha pin (HeadMovedError, base untouched); compare-and-swap refusal when the
 * base moves between reading and updating it; recovery from a crash after `update-ref`
 * for squash and merge methods; not found after the head branch is deleted.
 * Depends on: helpers/local-bare-rig, helpers/local-remote, src/adapters/git-cli/run-git.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { HeadMovedError } from '@forge/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createGitRunner } from '#/adapters/git-cli/run-git.js';
import { createLocalBareGitHost } from '#/index.js';
import { T0, push } from '#tests/helpers/local-bare-rig.js';
import { git, makeLocalRemote } from '#tests/helpers/local-remote.js';
import type { LocalRemote } from '#tests/helpers/local-remote.js';

const remotes: LocalRemote[] = [];

afterEach(async () => {
  await Promise.all(remotes.splice(0).map((r) => r.cleanup()));
});

describe('local bare host: merge safety', { timeout: 60_000 }, () => {
  it('refuses to merge a branch that moved after the gates judged it', async () => {
    const r = await makeLocalRemote();
    remotes.push(r);
    const { host, sha } = await push(r, 'feat/a', 'a.txt', 'a\n');
    const pr = await host.openPr({
      branch: 'feat/a',
      base: 'main',
      title: 'A',
      body: '',
    });

    await git(r.work, 'checkout', 'feat/a');
    await writeFile(join(r.work, 'late.txt'), 'late\n');
    await git(r.work, 'add', '-A');
    await git(r.work, 'commit', '-m', 'late');
    await host.push(r.work, 'feat/a');
    await git(r.work, 'checkout', 'main');
    const before = await r.remoteSha('main');

    const err = await host.merge(pr.number, 'squash', sha).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HeadMovedError);
    expect(await r.remoteSha('main')).toBe(before);
    expect((await host.prStatus(pr.number)).state).toBe('open');
  });

  it('refuses without overwriting when the base moved between reading it and updating it', async () => {
    const r = await makeLocalRemote();
    remotes.push(r);
    const real = createGitRunner('git');
    let moved: string | null = null;
    const host = createLocalBareGitHost({
      remotePath: r.remotePath,
      baseBranch: 'main',
      now: () => T0,
      git: {
        run: real.run,
        async try(cwd, args, opts) {
          // A competing push lands exactly when the merge is about to move the base.
          if (args[0] === 'update-ref' && args[1] === 'refs/heads/main') {
            moved ??= await r.commitOnMain('other.txt', 'other\n');
          }

          return real.try(cwd, args, opts);
        },
      },
    });

    const sha = await r.commitOnBranch('feat/a', 'a.txt', 'a\n');
    await git(r.work, 'checkout', 'feat/a');
    await host.push(r.work, 'feat/a');
    await git(r.work, 'checkout', 'main');
    const pr = await host.openPr({
      branch: 'feat/a',
      base: 'main',
      title: 'A',
      body: '',
    });

    const err = await host.merge(pr.number, 'squash', sha).catch((e: unknown) => e);

    expect(err).toMatchObject({ reason: 'merge_refused', errorFamily: 'policy_denied' });
    expect(moved).not.toBeNull();
    expect(await r.remoteSha('main')).toBe(moved);
    expect((await host.prStatus(pr.number)).state).toBe('open');
  });

  it.each(['squash', 'merge'] as const)(
    'records an already-applied %s merge as merged without writing an empty commit',
    async (method) => {
      const r = await makeLocalRemote();
      remotes.push(r);
      const { host, sha } = await push(r, 'feat/a', 'a.txt', 'a\n');
      const pr = await host.openPr({
        branch: 'feat/a',
        base: 'main',
        title: 'A',
        body: '',
      });

      const merged = await host.merge(pr.number, method, sha);
      // The crash: update-ref ran, the record still says open.
      const file = join(r.remotePath, 'forge-prs', '1.json');
      const record = JSON.parse(await readFile(file, 'utf8'));
      await writeFile(
        file,
        JSON.stringify({ ...record, state: 'open', merged_sha: undefined }),
      );

      const again = await host.merge(pr.number, method, sha);

      expect(again.sha).toBe(merged.sha);
      expect(await r.remoteSha('main')).toBe(merged.sha);
      expect((await host.prStatus(pr.number)).state).toBe('merged');
      // init + feature commit, plus the merge commit itself for the two-parent method.
      expect(await git(r.remotePath, 'rev-list', '--count', 'main')).toBe(
        method === 'merge' ? '3' : '2',
      );
    },
  );

  it('reports a PR whose head branch was deleted as not found', async () => {
    const r = await makeLocalRemote();
    remotes.push(r);
    const { host } = await push(r, 'feat/a', 'a.txt', 'a\n');
    const pr = await host.openPr({
      branch: 'feat/a',
      base: 'main',
      title: 'A',
      body: '',
    });

    await host.deleteBranch('feat/a');

    await expect(host.prStatus(pr.number)).rejects.toMatchObject({
      reason: 'not_found',
      errorFamily: 'invalid_input',
    });
  });
});
