/**
 * A throwaway repository with known history for RepoReader tests.
 *
 * Why: the reader must answer from committed content only, so the tests need a repository
 *   where the working tree deliberately disagrees with HEAD (an uncommitted edit, an untracked
 *   file, an ignored file) and where history has two commits to diff. Building it once here
 *   keeps the contract and the adapter-specific tests looking at the same facts.
 *
 * Exports: RepoFixture, makeRepoFixture(), git(), hashBlob().
 * Depends on: helpers/temp, node:child_process, node:fs. IO: git, temp folders.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { makeCanonicalTempDir } from '#tests/helpers/temp.js';

/** Where the fixture lives and the two commits it holds. */
export interface RepoFixture {
  readonly root: string;
  /** `<root>/src`, a subfolder, for projects scoped to a folder of a repository. */
  readonly sub: string;
  /** Commit 1: first version of every file. */
  readonly firstSha: string;
  /** Commit 2 (HEAD): only `src/a.ts` differs from commit 1. */
  readonly headSha: string;
}

/** Runs git synchronously in `cwd` and returns trimmed stdout (test setup only). */
export const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();

/** Writes a blob holding `text` into the repository and returns its id. */
export const hashBlob = (cwd: string, text: string): string =>
  execFileSync('git', ['hash-object', '-w', '--stdin'], {
    cwd,
    input: text,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();

const put = (dir: string, rel: string, data: string | Buffer): void => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), data);
};

/**
 * Tracked at HEAD: README.md, .gitignore, src/a.ts (contains `needle`), src/deep/b.ts
 * (`needle two`), docs/uni.txt (multibyte), bin.dat (NUL bytes). On disk but not in HEAD:
 * untracked.txt, ignored.log, and an uncommitted edit of README.md.
 */
export function makeRepoFixture(): RepoFixture {
  const root = makeCanonicalTempDir('forge reader ');
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'User');
  git(root, 'config', 'user.email', 'user@example.com');
  git(root, 'config', 'core.autocrlf', 'false');
  put(root, 'README.md', 'hello\n');
  put(root, '.gitignore', 'ignored.log\n');
  put(root, 'src/a.ts', 'export const a = 1;\n// needle\n');
  put(root, 'src/deep/b.ts', 'needle two\n');
  put(root, 'docs/uni.txt', 'héllo wörld ✓\n');
  put(root, 'bin.dat', Buffer.from([1, 2, 0, 3, 4]));
  git(root, 'add', '-A');
  git(root, 'commit', '-m', 'first');
  const firstSha = git(root, 'rev-parse', 'HEAD');
  put(root, 'src/a.ts', 'export const a = 2;\n// needle\n');
  git(root, 'commit', '-am', 'second');
  const headSha = git(root, 'rev-parse', 'HEAD');
  put(root, 'untracked.txt', 'not committed\n');
  put(root, 'ignored.log', 'secret\n');
  put(root, 'README.md', 'edited in the working tree\n');

  return { root, sub: join(root, 'src'), firstSha, headSha };
}
