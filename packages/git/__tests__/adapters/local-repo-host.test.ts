/**
 * Pins: a project with no remote merges verified work into its own repository, safely.
 *
 * Why: d-0124 lets any folder be a project, so the merge door lands work in a branch the
 *   user probably has checked out and is probably editing. The host must squash-merge exactly
 *   the commit the gates judged, move the user's branch and files only when that cannot lose
 *   their work, and otherwise stop with a typed error the engine turns into "Needs you".
 *   Real git, real worktrees made by the same manager the engine uses.
 *
 * Pins: clean checked-out base is fast-forwarded (files appear in the folder, one squash commit);
 *   dirty tracked file => `dirty_tree`, nothing moves, retry works once the user commits;
 *   base not checked out => only the ref moves and the user's tree is untouched; an untracked
 *   file in the way is never overwritten; a head that is not the judged sha => HeadMovedError;
 *   `push` is a no-op; the PR record lives inside the git folder, not the working tree.
 * Depends on: src/index, helpers/temp, node:child_process, node:fs. IO: git, temp folders.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HeadMovedError } from '@forge/core';
import { describe, expect, it } from 'vitest';
import {
  GitHostError,
  createGitWorktreeManager,
  createLocalRepoGitHost,
} from '#/index.js';
import { makeCanonicalTempDir, trackTemp } from '#tests/helpers/temp.js';

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();

const T0 = Date.parse('2026-10-16T10:00:00.000Z');

interface Rig {
  readonly repo: string;
  readonly host: ReturnType<typeof createLocalRepoGitHost>;
  /** Cuts a ticket worktree, adds `file`, commits, and returns what the engine would hold. */
  work(
    ticket: string,
    file: string,
    text: string,
  ): Promise<{ sha: string; branch: string }>;
  readonly manager: ReturnType<typeof createGitWorktreeManager>;
  readonly trees: string;
}

function rig(): Rig {
  const repo = makeCanonicalTempDir('forge local host ');
  const trees = trackTemp(`${repo}-trees`);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.name', 'User');
  git(repo, 'config', 'user.email', 'user@example.com');
  git(repo, 'config', 'core.autocrlf', 'false');
  writeFileSync(join(repo, 'a.txt'), 'one\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-m', 'init');

  const manager = createGitWorktreeManager({ repoRoot: repo, worktreeRoot: trees });
  const host = createLocalRepoGitHost({
    repoRoot: repo,
    baseBranch: 'main',
    now: () => T0,
  });

  return {
    repo,
    host,
    manager,
    trees,
    async work(ticket, file, text) {
      const branch = `feat/${ticket.toLowerCase()}`;
      const wt = await manager.create(ticket as never, branch, 'main');
      writeFileSync(join(wt.path, file), text);
      const sha = (await manager.commitAll(wt.path, `Work on ${ticket}`)) ?? '';
      await manager.remove(wt.path);

      return { sha, branch };
    },
  };
}

async function openPr(r: Rig, branch: string): Promise<number> {
  await r.host.push(r.repo, branch);
  const pr = await r.host.openPr({
    branch,
    base: 'main',
    title: `PR ${branch}`,
    body: '',
  });

  return pr.number;
}

describe('local repository git host', () => {
  it('fast-forwards a clean checked-out base: files appear, one squash commit', async () => {
    const r = rig();
    const { sha, branch } = await r.work('T-1', 'b.txt', 'two\n');
    const n = await openPr(r, branch);

    expect((await r.host.prStatus(n)).mergeable).toBe(true);
    const merged = await r.host.merge(n, 'squash', sha);

    expect(git(r.repo, 'rev-parse', 'main')).toBe(merged.sha);
    expect(readFileSync(join(r.repo, 'b.txt'), 'utf8')).toBe('two\n');
    expect(git(r.repo, 'status', '--porcelain')).toBe('');
    expect(git(r.repo, 'log', '-1', '--format=%P').split(' ')).toHaveLength(1);
    expect(git(r.repo, 'log', '-1', '--format=%an')).toBe('Forge');
    expect((await r.host.prStatus(n)).state).toBe('merged');
    // The record sits in the git folder; the user's working tree has no Forge files.
    expect(existsSync(join(r.repo, '.git', 'forge-prs', `${n}.json`))).toBe(true);
    expect(existsSync(join(r.repo, 'forge-prs'))).toBe(false);
  });

  it('stops with dirty_tree when tracked files have uncommitted changes, then merges after a commit', async () => {
    const r = rig();
    const { sha, branch } = await r.work('T-2', 'b.txt', 'two\n');
    const n = await openPr(r, branch);
    const before = git(r.repo, 'rev-parse', 'main');
    writeFileSync(join(r.repo, 'a.txt'), 'my edit\n');

    const err = await r.host.merge(n, 'squash', sha).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(GitHostError);
    expect((err as GitHostError).reason).toBe('dirty_tree');
    expect((err as GitHostError).errorFamily).toBe('invalid_input');
    expect((err as GitHostError).message).toMatch(/commit or stash/);
    expect(git(r.repo, 'rev-parse', 'main')).toBe(before);
    expect(readFileSync(join(r.repo, 'a.txt'), 'utf8')).toBe('my edit\n');
    expect((await r.host.prStatus(n)).state).toBe('open');

    git(r.repo, 'commit', '-am', 'my edit');
    const merged = await r.host.merge(n, 'squash', sha);

    expect(git(r.repo, 'rev-parse', 'main')).toBe(merged.sha);
    expect(readFileSync(join(r.repo, 'a.txt'), 'utf8')).toBe('my edit\n');
    expect(readFileSync(join(r.repo, 'b.txt'), 'utf8')).toBe('two\n');
  });

  it('moves only the branch when the base is not checked out, leaving the user tree alone', async () => {
    const r = rig();
    const { sha, branch } = await r.work('T-3', 'b.txt', 'two\n');
    const n = await openPr(r, branch);
    git(r.repo, 'checkout', '-b', 'scratch');
    writeFileSync(join(r.repo, 'a.txt'), 'dirty on scratch\n');

    const merged = await r.host.merge(n, 'squash', sha);

    expect(git(r.repo, 'rev-parse', 'main')).toBe(merged.sha);
    expect(git(r.repo, 'symbolic-ref', '--short', 'HEAD')).toBe('scratch');
    expect(readFileSync(join(r.repo, 'a.txt'), 'utf8')).toBe('dirty on scratch\n');
    expect(existsSync(join(r.repo, 'b.txt'))).toBe(false);
  });

  it('never overwrites an untracked file that is in the way', async () => {
    const r = rig();
    const { sha, branch } = await r.work('T-4', 'b.txt', 'from the ticket\n');
    const n = await openPr(r, branch);
    const before = git(r.repo, 'rev-parse', 'main');
    writeFileSync(join(r.repo, 'b.txt'), 'the user wrote this first\n');

    await expect(r.host.merge(n, 'squash', sha)).rejects.toMatchObject({
      reason: 'merge_refused',
    });

    expect(readFileSync(join(r.repo, 'b.txt'), 'utf8')).toBe(
      'the user wrote this first\n',
    );

    expect(git(r.repo, 'rev-parse', 'main')).toBe(before);
  });

  it('refuses a head that is not the commit the gates judged', async () => {
    const r = rig();
    const { branch } = await r.work('T-5', 'b.txt', 'two\n');
    const n = await openPr(r, branch);

    await expect(r.host.merge(n, 'squash', 'deadbeef')).rejects.toBeInstanceOf(
      HeadMovedError,
    );

    expect(existsSync(join(r.repo, 'b.txt'))).toBe(false);
  });

  it('push is a no-op and never touches a remote', async () => {
    const r = rig();
    mkdirSync(join(r.repo, 'x'));

    await expect(r.host.push(r.repo, 'whatever')).resolves.toBeUndefined();
    expect(git(r.repo, 'remote')).toBe('');
  });
});
