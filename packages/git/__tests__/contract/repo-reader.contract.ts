/**
 * Contract every `RepoReader` must pass: `describeRepoReaderContract(name, makeReader)`.
 *
 * Why: the Director's planning steps read the project through this port and must see exactly
 *   what a Worker's worktree starts from: the committed tree at HEAD, never an uncommitted
 *   edit, an untracked file or an ignored secret, and never anything outside the project
 *   folder. A hostile or confused path or pattern must be refused before git sees it. A new
 *   implementation passes this before it gets tests of its own.
 *
 * Exports: describeRepoReaderContract().
 * Depends on: vitest, helpers/repo-fixture, @forge/core (RepoReader, PolicyDeniedError, InvalidInputError).
 */

import { InvalidInputError, PolicyDeniedError } from '@forge/core';
import type { RepoReader } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { git, makeRepoFixture } from '#tests/helpers/repo-fixture.js';

const denied = (p: Promise<unknown>) =>
  expect(p).rejects.toBeInstanceOf(PolicyDeniedError);

export function describeRepoReaderContract(
  name: string,
  makeReader: () => RepoReader,
): void {
  // 30s per case: real git spawns several processes per call, slow on Windows.
  describe(`RepoReader contract: ${name}`, { timeout: 30_000 }, () => {
    const setup = () => ({ reader: makeReader(), fx: makeRepoFixture() });

    it('headSha is the commit HEAD points at, from the top and from a subfolder', async () => {
      const { reader, fx } = setup();

      expect(await reader.headSha(fx.root)).toBe(git(fx.root, 'rev-parse', 'HEAD'));
      expect(await reader.headSha(fx.sub)).toBe(fx.headSha);
    });

    it('listTracked lists committed files only, relative and with forward slashes', async () => {
      const { reader, fx } = setup();

      const all = await reader.listTracked(fx.root);
      const sub = await reader.listTracked(fx.sub);

      expect(all).toEqual(
        expect.arrayContaining([
          'README.md',
          'src/a.ts',
          'src/deep/b.ts',
          'docs/uni.txt',
        ]),
      );

      expect(all).not.toContain('untracked.txt');
      expect(all).not.toContain('ignored.log');
      expect([...sub].sort()).toEqual(['a.ts', 'deep/b.ts']);
    });

    it('listTracked honours a glob', async () => {
      const { reader, fx } = setup();

      expect(await reader.listTracked(fx.root, 'src/**/*.ts')).toEqual(
        expect.arrayContaining(['src/a.ts', 'src/deep/b.ts']),
      );

      expect(await reader.listTracked(fx.root, '*.md')).toEqual(['README.md']);
    });

    it('readAtHead returns the committed content, not the edited working tree', async () => {
      const { reader, fx } = setup();

      const file = await reader.readAtHead(fx.root, 'README.md', 1000);

      expect(file).toEqual({
        path: 'README.md',
        content: 'hello\n',
        bytes: 6,
        truncated: false,
      });

      expect((await reader.readAtHead(fx.sub, 'deep/b.ts', 1000)).content).toBe(
        'needle two\n',
      );
    });

    it('readAtHead cuts at maxBytes and reports the whole size', async () => {
      const { reader, fx } = setup();

      const file = await reader.readAtHead(fx.root, 'README.md', 3);

      expect(file).toMatchObject({ content: 'hel', bytes: 6, truncated: true });
    });

    it.each([
      ['a parent segment', '../x'],
      ['a nested parent segment', 'src/../../x'],
      ['an absolute path', '/etc/passwd'],
      ['a drive path', 'C:\\x'],
      ['a drive path with slashes', 'C:/x'],
      ['a UNC path', '\\\\host\\share\\x'],
      ['an empty path', ''],
      ['a NUL byte', 'README.md\0.txt'],
      ['a control character', 'README\n.md'],
      ['an untracked file', 'untracked.txt'],
      ['an ignored file', 'ignored.log'],
      ['a directory', 'src'],
      ['a missing file', 'nope.txt'],
    ])('readAtHead refuses %s', async (_label, path) => {
      const { reader, fx } = setup();

      await denied(reader.readAtHead(fx.root, path, 100));
    });

    it('grepAtHead finds hits with paths relative to root, from the top and a subfolder', async () => {
      const { reader, fx } = setup();

      const top = await reader.grepAtHead(fx.root, 'needle', undefined, 10);
      const sub = await reader.grepAtHead(fx.sub, 'needle', undefined, 10);

      expect(top).toEqual(
        expect.arrayContaining([
          { path: 'src/a.ts', line: 2, text: '// needle' },
          { path: 'src/deep/b.ts', line: 1, text: 'needle two' },
        ]),
      );

      expect(sub.map((h) => h.path).sort()).toEqual(['a.ts', 'deep/b.ts']);
    });

    it('grepAtHead respects glob and maxHits, and no match is an empty list', async () => {
      const { reader, fx } = setup();

      const globbed = await reader.grepAtHead(fx.root, 'needle', 'src/deep/*.ts', 10);
      const capped = await reader.grepAtHead(fx.root, 'needle', undefined, 1);
      const none = await reader.grepAtHead(fx.root, 'zzz-not-there', undefined, 10);

      expect(globbed.map((h) => h.path)).toEqual(['src/deep/b.ts']);
      expect(capped).toHaveLength(1);
      expect(none).toEqual([]);
    });

    it('grepAtHead never searches the working tree', async () => {
      const { reader, fx } = setup();

      expect(await reader.grepAtHead(fx.root, 'secret', undefined, 10)).toEqual([]);
      expect(
        await reader.grepAtHead(fx.root, 'edited in the working', undefined, 10),
      ).toEqual([]);
    });

    it('grepAtHead treats a leading dash as pattern text and supports regex syntax', async () => {
      const { reader, fx } = setup();

      expect(await reader.grepAtHead(fx.root, '--version', undefined, 10)).toEqual([]);
      expect(await reader.grepAtHead(fx.root, '-e', undefined, 10)).toEqual([]);
      expect(await reader.grepAtHead(fx.root, 'a = [0-9];$', undefined, 10)).toEqual([
        { path: 'src/a.ts', line: 1, text: 'export const a = 2;' },
      ]);

      expect(
        await reader.grepAtHead(fx.root, '(needle|hello) two', undefined, 10),
      ).toHaveLength(1);
    });

    it.each([
      ['empty', ''],
      ['a control character', 'a\nb'],
      ['a NUL byte', 'a\0b'],
      ['over 500 characters', 'a'.repeat(501)],
    ])('grepAtHead refuses a pattern that is %s', async (_label, pattern) => {
      const { reader, fx } = setup();

      await denied(reader.grepAtHead(fx.root, pattern, undefined, 10));
    });

    it('changedFiles returns the listed files and folders that changed between two commits', async () => {
      const { reader, fx } = setup();

      expect(
        await reader.changedFiles(fx.root, fx.firstSha, fx.headSha, ['src/a.ts']),
      ).toEqual(['src/a.ts']);

      expect(
        await reader.changedFiles(fx.root, fx.firstSha, fx.headSha, ['src']),
      ).toEqual(['src/a.ts']);

      expect(
        await reader.changedFiles(fx.root, fx.firstSha, fx.headSha, [
          'README.md',
          'docs',
        ]),
      ).toEqual([]);

      expect(
        await reader.changedFiles(fx.sub, fx.firstSha, fx.headSha, ['a.ts', 'deep']),
      ).toEqual(['a.ts']);

      expect(await reader.changedFiles(fx.root, fx.headSha, fx.headSha, ['src'])).toEqual(
        [],
      );
    });

    it('changedFiles refuses anything that is not a hex sha', async () => {
      const { reader, fx } = setup();

      for (const bad of [
        '--output=x',
        'HEAD',
        'main',
        '',
        'zzzzzzz',
        `${fx.headSha} --stat`,
      ]) {
        await expect(
          reader.changedFiles(fx.root, bad, fx.headSha, ['src']),
        ).rejects.toBeInstanceOf(InvalidInputError);

        await expect(
          reader.changedFiles(fx.root, fx.firstSha, bad, ['src']),
        ).rejects.toBeInstanceOf(InvalidInputError);
      }
    });
  });
}
