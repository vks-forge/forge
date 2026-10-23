/**
 * The commit Forge makes for a ticket carries `Forge-Ticket` and `Forge-Run` trailers that git itself reads.
 *
 * Why: the branch's git log outlives the Forge database. A trailer block lets anyone with plain
 *   git (any language, no Forge install) find the ticket and Worker run behind a commit. The
 *   message passes through the real `git commit` here, because a trailer git cannot parse (no blank
 *   line, stray text after it) would look right in a string comparison and still be invisible to
 *   `git log --format=%(trailers)`.
 *
 * Pins: `commitMessage` output survives `commitAll` unchanged, `git interpret-trailers --parse`
 *   returns both trailers, and the subject stays the first line.
 * Depends on: src/index, @forge/core (commitMessage), helpers/temp, node:child_process, node:fs. IO: git, temp folders.
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { commitMessage } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { createGitWorktreeManager } from '#/index.js';
import { makeCanonicalTempDir, trackTemp } from '#tests/helpers/temp.js';

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();

describe('Forge commit trailers', () => {
  it('are read back by git interpret-trailers and git log', async () => {
    const repo = makeCanonicalTempDir('forge trailers ');
    const trees = trackTemp(`${repo}-trees`);
    git(repo, 'init', '-b', 'main');
    git(repo, 'config', 'user.name', 'User');
    git(repo, 'config', 'user.email', 'user@example.com');
    writeFileSync(join(repo, 'a.txt'), 'a\n');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-m', 'init');
    const manager = createGitWorktreeManager({ repoRoot: repo, worktreeRoot: trees });
    const wt = await manager.create('T-1' as never, 'feat/t-1', 'main');
    writeFileSync(join(wt.path, 'b.txt'), 'b\n');

    const sha = await manager.commitAll(
      wt.path,
      commitMessage('feat(T-1): add b', { ticketId: 'T-1', runId: 'run-7' }),
    );

    const body = git(wt.path, 'log', '-1', '--format=%B', sha ?? 'HEAD');
    const parsed = execFileSync('git', ['interpret-trailers', '--parse'], {
      cwd: wt.path,
      input: body,
      encoding: 'utf8',
      windowsHide: true,
    })
      .trim()
      .split(/\r?\n/);

    expect(parsed).toEqual(['Forge-Ticket: T-1', 'Forge-Run: run-7']);
    expect(git(wt.path, 'log', '-1', '--format=%s', 'HEAD')).toBe('feat(T-1): add b');
    expect(
      git(wt.path, 'log', '-1', '--format=%(trailers:key=Forge-Run,valueonly)', 'HEAD'),
    ).toBe('run-7');
  });
});
