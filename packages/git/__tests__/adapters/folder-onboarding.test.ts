/**
 * Pins: how Forge looks at a folder with git and starts a local repository in one that has none.
 *
 * Why: any folder can become a project (d-0124). A wrong answer here either hides a choice
 *   the user must make (a folder inside another repository), freezes junk into their history
 *   (a snapshot of node_modules), nests a repository inside another, or quietly edits the
 *   user's own git configuration. Each case runs real git on throwaway folders.
 *
 * Pins: state repo / none / inside_repo with subfolder, commits, dirty and remote (GitHub
 *   parsed); snapshot count honours an existing `.gitignore` and the standard list; snapshot
 *   refuses above the size guard and writes nothing; snapshot commit has the Forge identity
 *   and keeps an existing `.gitignore`; init only leaves no commit; no nested init; the global
 *   git config is never written; githubRepoOf() spellings.
 * Depends on: src/index, helpers/temp, node:child_process, node:fs. IO: git, temp folders.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SnapshotTooLargeError,
  githubRepoOf,
  initLocalRepo,
  inspectFolderGit,
  scanSnapshot,
} from '#/index.js';
import { makeCanonicalTempDir } from '#tests/helpers/temp.js';

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();

const folder = (): string => makeCanonicalTempDir('forge onboard ');

const put = (dir: string, rel: string, text = 'x\n'): void => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), text);
};

const who = ['-c', 'user.name=T', '-c', 'user.email=t@example.com'];

function repoWithCommit(): string {
  const dir = folder();
  git(dir, 'init', '-b', 'main');
  put(dir, 'a.txt');
  git(dir, ...who, 'add', '-A');
  git(dir, ...who, 'commit', '-m', 'one');

  return dir;
}

let savedGlobal: string | undefined;
let globalCfg = '';

beforeEach(() => {
  // A global config path that does not exist: any write to it shows up as a created file.
  savedGlobal = process.env['GIT_CONFIG_GLOBAL'];
  globalCfg = join(folder(), 'global-gitconfig');
  process.env['GIT_CONFIG_GLOBAL'] = globalCfg;
});

afterEach(() => {
  if (savedGlobal === undefined) {
    delete process.env['GIT_CONFIG_GLOBAL'];
  } else {
    process.env['GIT_CONFIG_GLOBAL'] = savedGlobal;
  }
});

describe('inspectFolderGit', () => {
  it('says none for a plain folder', async () => {
    const dir = folder();

    expect(await inspectFolderGit({ path: dir })).toEqual({
      state: 'none',
      repo_root: null,
      subfolder: null,
      has_commits: false,
      dirty: false,
      remote: null,
    });
  });

  it('reports a repository root with commits, a clean tree and a GitHub remote', async () => {
    const dir = repoWithCommit();
    git(dir, 'remote', 'add', 'origin', 'git@github.com:acme/widgets.git');

    const found = await inspectFolderGit({ path: dir });

    expect(found).toMatchObject({
      state: 'repo',
      subfolder: null,
      has_commits: true,
      dirty: false,
      remote: {
        name: 'origin',
        url: 'git@github.com:acme/widgets.git',
        github: { owner: 'acme', repo: 'widgets' },
      },
    });

    expect(found.repo_root?.toLowerCase()).toBe(dir.replaceAll('\\', '/').toLowerCase());
  });

  it('reports an empty repository and a dirty tracked file', async () => {
    const empty = folder();
    git(empty, 'init', '-b', 'main');
    const dirty = repoWithCommit();
    put(dirty, 'a.txt', 'changed\n');
    put(dirty, 'untracked.txt');

    expect(await inspectFolderGit({ path: empty })).toMatchObject({
      state: 'repo',
      has_commits: false,
    });

    expect(await inspectFolderGit({ path: dirty })).toMatchObject({ dirty: true });
  });

  it('reports a folder inside a repository with its subfolder, and a non-GitHub remote', async () => {
    const dir = repoWithCommit();
    git(dir, 'remote', 'add', 'upstream', 'https://gitlab.com/acme/x.git');
    mkdirSync(join(dir, 'packages', 'web'), { recursive: true });

    const found = await inspectFolderGit({ path: join(dir, 'packages', 'web') });

    expect(found).toMatchObject({
      state: 'inside_repo',
      subfolder: 'packages/web',
      has_commits: true,
      remote: { name: 'upstream', github: null },
    });
  });
});

describe('githubRepoOf', () => {
  it.each([
    'https://github.com/acme/widgets.git',
    'https://user:tok@github.com/acme/widgets',
    'git@github.com:acme/widgets.git',
    'ssh://git@github.com/acme/widgets.git',
  ])('reads %s', (url) => {
    expect(githubRepoOf(url)).toEqual({ owner: 'acme', repo: 'widgets' });
  });

  it.each(['https://gitlab.com/acme/widgets.git', '/srv/git/widgets.git', ''])(
    'is not GitHub: %s',
    (url) => {
      expect(githubRepoOf(url)).toBeNull();
    },
  );
});

describe('scanSnapshot', () => {
  it('counts what git add -A would take: standard ignores apply when there is no .gitignore', async () => {
    const dir = folder();
    put(dir, 'src/a.ts', '1234567890');
    put(dir, 'node_modules/dep/index.js', 'ignored');
    put(dir, '.env', 'SECRET=1');

    expect(await scanSnapshot({ path: dir })).toEqual({
      files: 1,
      bytes: 10,
      has_gitignore: false,
      truncated: false,
    });
  });

  it('uses the folder own .gitignore when it has one, and writes nothing', async () => {
    const dir = folder();
    put(dir, '.gitignore', 'secret/\n');
    put(dir, 'secret/key', 'k');
    put(dir, 'node_modules/x.js', 'kept because their ignore list wins');

    const scan = await scanSnapshot({ path: dir });

    expect(scan).toMatchObject({ files: 2, has_gitignore: true, truncated: false });
    expect(existsSync(join(dir, '.git'))).toBe(false);
  });

  it('stops at the file limit and says it is truncated', async () => {
    const dir = folder();
    for (let i = 0; i < 6; i++) {
      put(dir, `f${i}.txt`);
    }

    const scan = await scanSnapshot({
      path: dir,
      limits: { maxFiles: 3, maxBytes: 1e9 },
    });

    expect(scan.truncated).toBe(true);
  });
});

describe('initLocalRepo', () => {
  it('snapshot: commits the files with the Forge identity, adds .gitignore, leaves global config alone', async () => {
    const dir = folder();
    put(dir, 'src/a.ts');
    put(dir, 'node_modules/dep/index.js');

    const result = await initLocalRepo({ path: dir, branch: 'main', mode: 'snapshot' });

    expect(result.wroteGitignore).toBe(true);
    expect(git(dir, 'rev-parse', 'HEAD')).toBe(result.commit);
    expect(git(dir, 'symbolic-ref', '--short', 'HEAD')).toBe('main');
    expect(git(dir, 'log', '-1', '--format=%s|%an|%ae')).toBe(
      'Initial snapshot (Forge)|Forge|forge@localhost',
    );

    expect(git(dir, 'ls-files').split('\n').sort()).toEqual(['.gitignore', 'src/a.ts']);
    expect(existsSync(globalCfg)).toBe(false);
  });

  it('snapshot: keeps an existing .gitignore untouched', async () => {
    const dir = folder();
    put(dir, '.gitignore', 'mine\n');
    put(dir, 'a.txt');

    const result = await initLocalRepo({ path: dir, branch: 'trunk', mode: 'snapshot' });

    expect(result.wroteGitignore).toBe(false);
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe('mine\n');
    expect(git(dir, 'symbolic-ref', '--short', 'HEAD')).toBe('trunk');
  });

  it('snapshot: refuses above the size guard before writing anything', async () => {
    const dir = folder();
    for (let i = 0; i < 6; i++) {
      put(dir, `f${i}.txt`);
    }

    await expect(
      initLocalRepo({
        path: dir,
        branch: 'main',
        mode: 'snapshot',
        limits: { maxFiles: 3, maxBytes: 1e9 },
      }),
    ).rejects.toBeInstanceOf(SnapshotTooLargeError);

    expect(existsSync(join(dir, '.git'))).toBe(false);
    expect(existsSync(join(dir, '.gitignore'))).toBe(false);
  });

  it('init only: an empty repository on the named branch, no commit, no files written', async () => {
    const dir = folder();
    put(dir, 'a.txt');

    const result = await initLocalRepo({ path: dir, branch: 'main', mode: 'init_only' });

    expect(result).toEqual({ commit: null, wroteGitignore: false });
    expect(git(dir, 'symbolic-ref', '--short', 'HEAD')).toBe('main');
    expect(existsSync(join(dir, '.gitignore'))).toBe(false);
    expect(await inspectFolderGit({ path: dir })).toMatchObject({
      state: 'repo',
      has_commits: false,
    });
  });

  it('never starts a repository inside another one', async () => {
    const outer = repoWithCommit();
    const inner = join(outer, 'sub');
    mkdirSync(inner);

    await expect(
      initLocalRepo({ path: inner, branch: 'main', mode: 'init_only' }),
    ).rejects.toThrow(/already inside a git repository/);

    expect(existsSync(join(inner, '.git'))).toBe(false);
  });
});
