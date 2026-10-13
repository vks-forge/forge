/**
 * Pins: the local bare-repo GitHost satisfies the contract on real repos, and its own
 * guarantees: push lands the branch, merge commits have the right parents, conflicts
 * are refused without moving the base, no temp directories remain, PR records survive a
 * new host instance.
 *
 * Why: the end-to-end fixture trusts this host to behave like GitHub offline. A merge that
 * silently overwrote a moved base, or left a clone behind, would corrupt the fixture or
 * leak disk; a PR forgotten on restart would strand a `verifying` ticket (d-0062).
 *
 * Depends on: contract/git-host.contract, helpers/local-remote, src/index, node:fs.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createLocalBareGitHost } from '#/index.js';
import { describeGitHostContract } from '#tests/contract/git-host.contract.js';
import type { GitHostHarness } from '#tests/contract/git-host.contract.js';
import { git, makeLocalRemote } from '#tests/helpers/local-remote.js';
import type { LocalRemote } from '#tests/helpers/local-remote.js';

const remotes: LocalRemote[] = [];
const T0 = Date.parse('2026-10-13T10:00:00.000Z');

const hostFor = (r: LocalRemote) =>
  createLocalBareGitHost({ remotePath: r.remotePath, baseBranch: 'main', now: () => T0 });

/** Commits a branch in the clone and pushes it through the host, as the engine would. */
async function push(r: LocalRemote, branch: string, file: string, content: string) {
  const host = hostFor(r);
  const sha = await r.commitOnBranch(branch, file, content);
  await git(r.work, 'checkout', branch);
  await host.push(r.work, branch);
  await git(r.work, 'checkout', 'main');
  return { host, sha };
}

afterEach(async () => {
  await Promise.all(remotes.splice(0).map((r) => r.cleanup()));
});

describeGitHostContract('local bare', async (): Promise<GitHostHarness> => {
  const r = await makeLocalRemote();
  const host = hostFor(r);
  return {
    host,
    baseBranch: 'main',
    async seedBranch(branch) {
      const sha = await r.commitOnBranch(
        branch,
        `${branch.replaceAll('/', '_')}.txt`,
        'x\n',
      );
      await git(r.work, 'checkout', branch);
      await host.push(r.work, branch);
      await git(r.work, 'checkout', 'main');
      return sha;
    },
    branchExists: async (b) => (await r.remoteSha(b)) !== null,
    baseSha: async () => (await r.remoteSha('main')) as string,
    close: r.cleanup,
  };
});

describe('local bare host specifics', { timeout: 60_000 }, () => {
  it('push puts the branch on the remote at the worktree commit', async () => {
    const r = await makeLocalRemote();
    remotes.push(r);

    const { sha } = await push(r, 'feat/a', 'a.txt', 'a\n');

    expect(await r.remoteSha('feat/a')).toBe(sha);
  });

  it('push refuses a branch name that looks like an option', async () => {
    const r = await makeLocalRemote();
    remotes.push(r);

    await expect(hostFor(r).push(r.work, '--upload-pack=x')).rejects.toMatchObject({
      errorFamily: 'invalid_input',
    });
  });

  it('a merge-method merge makes a two-parent commit; a squash makes a one-parent commit', async () => {
    const r = await makeLocalRemote();
    remotes.push(r);
    const a = await push(r, 'feat/a', 'a.txt', 'a\n');
    await push(r, 'feat/b', 'b.txt', 'b\n');
    const prA = await a.host.openPr({
      branch: 'feat/a',
      base: 'main',
      title: 'A',
      body: '',
    });
    const prB = await a.host.openPr({
      branch: 'feat/b',
      base: 'main',
      title: 'B',
      body: '',
    });

    const merged = await a.host.merge(prA.number, 'merge');
    const squashed = await a.host.merge(prB.number, 'squash');

    expect(
      (await git(r.remotePath, 'rev-list', '--parents', '-n1', merged.sha)).split(' '),
    ).toHaveLength(3);
    expect(
      (await git(r.remotePath, 'rev-list', '--parents', '-n1', squashed.sha)).split(' '),
    ).toHaveLength(2);
    expect(await git(r.remotePath, 'show', 'main:a.txt')).toBe('a');
    expect(await git(r.remotePath, 'show', 'main:b.txt')).toBe('b');
    expect(
      await git(r.remotePath, 'log', '-1', '--format=%an|%s|%aI', squashed.sha),
    ).toBe('Forge|B (#2)|2026-10-13T10:00:00Z');
  });

  it('refuses a conflicting merge without moving the base, and reports it unmergeable', async () => {
    const r = await makeLocalRemote();
    remotes.push(r);
    const { host } = await push(r, 'feat/a', 'README.md', 'from branch\n');
    const pr = await host.openPr({
      branch: 'feat/a',
      base: 'main',
      title: 'A',
      body: '',
    });
    const moved = await r.commitOnMain('README.md', 'from main\n');

    const status = await host.prStatus(pr.number);
    const err = await host.merge(pr.number, 'squash').catch((e: unknown) => e);

    expect(status.mergeable).toBe(false);
    expect(err).toMatchObject({ errorFamily: 'policy_denied', reason: 'merge_refused' });
    expect(await r.remoteSha('main')).toBe(moved);
    expect((await host.prStatus(pr.number)).state).toBe('open');
  });

  it('leaves no clone or temp directory behind after a merge', async () => {
    const r = await makeLocalRemote();
    remotes.push(r);
    const { host } = await push(r, 'feat/a', 'a.txt', 'a\n');
    const pr = await host.openPr({
      branch: 'feat/a',
      base: 'main',
      title: 'A',
      body: '',
    });
    const before = (await readdir(r.root)).sort();

    await host.merge(pr.number, 'squash');

    expect((await readdir(r.root)).sort()).toEqual(before);
    expect(await readdir(join(r.remotePath, 'forge-prs'))).toEqual(['1.json']);
  });

  it('keeps PR records across host instances and writes them as JSON', async () => {
    const r = await makeLocalRemote();
    remotes.push(r);
    const { host } = await push(r, 'feat/a', 'a.txt', 'a\n');
    const pr = await host.openPr({
      branch: 'feat/a',
      base: 'main',
      title: 'A',
      body: 'b',
    });

    const status = await hostFor(r).prStatus(pr.number);
    const record = JSON.parse(
      await readFile(join(r.remotePath, 'forge-prs', '1.json'), 'utf8'),
    );

    expect(status.state).toBe('open');
    expect(record).toMatchObject({
      number: 1,
      branch: 'feat/a',
      state: 'open',
      title: 'A',
    });
  });

  it('refuses to open a PR for a branch that was never pushed', async () => {
    const r = await makeLocalRemote();
    remotes.push(r);

    await expect(
      hostFor(r).openPr({ branch: 'feat/none', base: 'main', title: 't', body: '' }),
    ).rejects.toMatchObject({ errorFamily: 'invalid_input' });
  });

  it('numbers PRs without gaps or duplicates when opened concurrently', async () => {
    const r = await makeLocalRemote();
    remotes.push(r);
    const { host } = await push(r, 'feat/a', 'a.txt', 'a\n');
    await push(r, 'feat/b', 'b.txt', 'b\n');
    await push(r, 'feat/c', 'c.txt', 'c\n');

    const prs = await Promise.all(
      ['feat/a', 'feat/b', 'feat/c'].map((branch) =>
        host.openPr({ branch, base: 'main', title: branch, body: '' }),
      ),
    );

    expect(prs.map((p) => p.number).sort()).toEqual([1, 2, 3]);
  });
});
