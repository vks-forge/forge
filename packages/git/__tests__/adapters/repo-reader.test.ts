/**
 * Pins: the git-CLI RepoReader satisfies the RepoReader contract and its git-specific edges.
 *
 * Why: the Director must read only what a Worker's worktree starts from. Beyond the shared
 *   contract, the git adapter has to cut multibyte text on a character boundary (a model must
 *   never be shown a broken character), refuse binary files (they would only burn the model's
 *   context), and refuse symlinks and submodules (a link could point outside the project).
 *   A git failure must surface as a typed error, never as an empty answer.
 *
 * Pins: contract on real repos; truncation never splits a UTF-8 character; binary, symlink and
 *   submodule entries are refused; staged-only files are invisible; a bad root is a CrashError.
 * Depends on: contract/repo-reader.contract, helpers/repo-fixture, src/index. IO: git, temp folders.
 */

import { CrashError, PolicyDeniedError } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { createGitRepoReader } from '#/index.js';
import { describeRepoReaderContract } from '#tests/contract/repo-reader.contract.js';
import { git, hashBlob, makeRepoFixture } from '#tests/helpers/repo-fixture.js';
import { makeCanonicalTempDir } from '#tests/helpers/temp.js';

describeRepoReaderContract('git cli', () => createGitRepoReader());

describe('git RepoReader specifics', { timeout: 30_000 }, () => {
  it('never splits a multibyte character when truncating', async () => {
    const fx = makeRepoFixture();
    const reader = createGitRepoReader();
    const text = 'héllo wörld ✓\n';

    const whole = await reader.readAtHead(fx.root, 'docs/uni.txt', 1000);
    const cutInsideAccent = await reader.readAtHead(fx.root, 'docs/uni.txt', 2);
    const exact = await reader.readAtHead(fx.root, 'docs/uni.txt', 3);
    const cutInsideMark = await reader.readAtHead(fx.root, 'docs/uni.txt', 15);

    expect(whole.bytes).toBe(Buffer.byteLength(text));
    expect(cutInsideAccent).toMatchObject({
      content: 'h',
      truncated: true,
      bytes: whole.bytes,
    });

    expect(exact.content).toBe('hé');
    expect(cutInsideMark.content).toBe('héllo wörld ');
    expect(cutInsideMark.content).not.toContain('�');
  });

  it('is not truncated when the file fits exactly', async () => {
    const fx = makeRepoFixture();

    const file = await createGitRepoReader().readAtHead(fx.root, 'README.md', 6);

    expect(file.truncated).toBe(false);
  });

  it('refuses a binary file rather than returning garbage text', async () => {
    const fx = makeRepoFixture();
    const reader = createGitRepoReader();

    const attempt = reader.readAtHead(fx.root, 'bin.dat', 100);

    await expect(attempt).rejects.toBeInstanceOf(PolicyDeniedError);
    await expect(attempt).rejects.toThrow(/binary/);
  });

  it('refuses a symlink and a submodule entry and leaves them out of listTracked', async () => {
    const fx = makeRepoFixture();
    const target = hashBlob(fx.root, '../outside.txt');
    git(fx.root, 'update-index', '--add', '--cacheinfo', `120000,${target},link.txt`);
    git(
      fx.root,
      'update-index',
      '--add',
      '--cacheinfo',
      `160000,${fx.headSha},vendor/mod`,
    );

    git(fx.root, 'commit', '-m', 'link and submodule');
    const reader = createGitRepoReader();

    const tracked = await reader.listTracked(fx.root);

    await expect(reader.readAtHead(fx.root, 'link.txt', 100)).rejects.toBeInstanceOf(
      PolicyDeniedError,
    );

    await expect(reader.readAtHead(fx.root, 'vendor/mod', 100)).rejects.toBeInstanceOf(
      PolicyDeniedError,
    );

    expect(tracked).not.toContain('link.txt');
    expect(tracked).not.toContain('vendor/mod');
    expect(tracked).toContain('README.md');
  });

  it('refuses a staged but uncommitted file: HEAD is the only source', async () => {
    const fx = makeRepoFixture();
    git(fx.root, 'add', 'untracked.txt');
    const reader = createGitRepoReader();

    const tracked = await reader.listTracked(fx.root);

    await expect(reader.readAtHead(fx.root, 'untracked.txt', 100)).rejects.toBeInstanceOf(
      PolicyDeniedError,
    );

    expect(tracked).not.toContain('untracked.txt');
  });

  it('treats git pathspec magic in a path as a literal name', async () => {
    const fx = makeRepoFixture();
    const reader = createGitRepoReader();

    await expect(
      reader.readAtHead(fx.root, ':(top)README.md', 100),
    ).rejects.toBeInstanceOf(PolicyDeniedError);

    await expect(reader.readAtHead(fx.root, 'src/*.ts', 100)).rejects.toBeInstanceOf(
      PolicyDeniedError,
    );
  });

  it('surfaces a folder that is not a repository as a CrashError', async () => {
    const empty = makeCanonicalTempDir('forge not repo ');
    const reader = createGitRepoReader();

    await expect(reader.headSha(empty)).rejects.toBeInstanceOf(CrashError);
    await expect(reader.grepAtHead(empty, 'x', undefined, 5)).rejects.toBeInstanceOf(
      CrashError,
    );
  });
});
