/**
 * A throwaway target repository with a local bare remote and a `.forge/` config.
 *
 * Why: the end-to-end test and the live probe must run the real worktree manager, the real
 *   `local-bare` git host and the real G1 gate against a real repository, never against
 *   mocks of git. This builds the smallest repository those need: a node-only project whose
 *   `test` and `lint` scripts need no install, a source file and a test file, a bare
 *   repository standing in for the remote with `main` pushed, and no tool catalogue (it lives in the database)
 *   copied in, so `loadSettings()` is exercised exactly as in production. The repository
 *   is registered like a user would: `fixtureProjectBody()` is the `POST /projects` body for
 *   it. Forge's data home is a sibling temp directory, never inside the repository.
 *   Everything lives under the OS temp directory (or a directory the caller names) and is
 *   removed by `dispose()`.
 *
 * Exports: FixtureRepo, createFixtureRepo(), createPlainFixture(), createSubfolderFixture(),
 *   fixtureProjectBody(), git().
 * Depends on: node:child_process, node:fs, node:os, node:path. IO: creates directories and runs git.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { trackTemp } from '#tests/helpers/temp.js';

export interface FixtureRepo {
  /** The main checkout the server runs in (FORGE_ROOT). */
  readonly root: string;
  /** The bare repository that plays the remote. */
  readonly remote: string;
  /** A throwaway Forge data home (pass it as FORGE_HOME); database, runs and worktrees go here. */
  readonly dataHome: string;
  dispose(): void;
}

/** Runs git in `cwd` and returns trimmed stdout. */
export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();
}

const SOURCE = `export function subtract(a, b) {
  return a - b;
}
`;

const TEST = `import assert from 'node:assert/strict';
import { test } from 'node:test';
import { subtract } from '../src/math.js';

test('subtracts two numbers', () => {
  assert.equal(subtract(3, 1), 2);
});
`;

const LINT = `import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/math.js', import.meta.url), 'utf8');
if (source.includes('debugger')) {
  console.error('debugger statement found');
  process.exit(1);
}
`;

/** The node project the fixtures hold: a source file, its test and a lint script, needing no install. */
function writeProjectFiles(dir: string): void {
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'test'), { recursive: true });
  mkdirSync(join(dir, 'scripts'), { recursive: true });

  const pkg = {
    name: 'fixture',
    version: '1.0.0',
    private: true,
    type: 'module',
    scripts: { test: 'node --test', lint: 'node scripts/lint.mjs' },
  };

  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
  writeFileSync(join(dir, 'src', 'math.js'), SOURCE);
  writeFileSync(join(dir, 'test', 'math.test.js'), TEST);
  writeFileSync(join(dir, 'scripts', 'lint.mjs'), LINT);
}

/** Removes `paths` with retries; Windows may hold a handle for a moment after a child exits. */
function removeAll(paths: readonly string[]): void {
  for (const path of paths) {
    try {
      rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    } catch (error) {
      process.stderr.write(
        `fixture cleanup: ${path} not removed yet (${(error as NodeJS.ErrnoException).code ?? 'unknown'})\n`,
      );
    }
  }
}

/**
 * The node project in a folder with no git at all (d-0124): register it with a `git_setup`.
 * `remote` is unused (there is none).
 */
export function createPlainFixture(): FixtureRepo {
  const root = trackTemp(mkdtempSync(join(tmpdir(), 'forge-plain-fixture-')));
  const dataHome = trackTemp(`${root}-home`);
  writeProjectFiles(root);

  return { root, remote: '', dataHome, dispose: () => removeAll([root, dataHome]) };
}

/**
 * A repository whose project is its `app/` subfolder: `README.md` and `other/` sit beside it
 * and belong to someone else. `root` is the repository top; register `join(root, 'app')`.
 */
export function createSubfolderFixture(): FixtureRepo {
  const root = trackTemp(mkdtempSync(join(tmpdir(), 'forge-sub-fixture-')));
  const dataHome = trackTemp(`${root}-home`);
  writeProjectFiles(join(root, 'app'));
  mkdirSync(join(root, 'other'), { recursive: true });
  writeFileSync(join(root, 'README.md'), 'not the project\n');
  writeFileSync(join(root, 'other', 'notes.txt'), 'not the project either\n');
  writeFileSync(join(root, '.gitignore'), 'node_modules/\n');
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Fixture');
  git(root, 'config', 'user.email', 'fixture@localhost');
  git(root, 'config', 'core.autocrlf', 'false');
  git(root, 'add', '-A');
  git(root, 'commit', '-m', 'fixture: initial commit');

  return { root, remote: '', dataHome, dispose: () => removeAll([root, dataHome]) };
}

/** The `POST /projects` body that registers `fixture` as project `fixture` (prefix FX) with a local bare host. */
export function fixtureProjectBody(
  fixture: FixtureRepo,
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    slug: 'fixture',
    prefix: 'FX',
    local_path: fixture.root,
    base_branch: 'main',
    git_host: { kind: 'local', remote_path: fixture.remote, base_branch: 'main' },
    settings: {
      checks: [
        { name: 'lint', role: 'lint', command: 'node scripts/lint.mjs' },
        { name: 'test', role: 'test', command: 'npm test' },
      ],
      default_harness: 'claude-code',
    },
    author: 'tester',
    reason: 'fixture project',
    ...over,
  };
}

/** `dir` defaults to a fresh temp directory; pass one to keep artefacts (the live probe does). */
export function createFixtureRepo(dir?: string): FixtureRepo {
  // A caller-named `dir` is kept on purpose (the live probe keeps it on failure); anything
  // else is removed with its remote when the test file ends, even if dispose() was missed.
  const root = dir ?? trackTemp(mkdtempSync(join(tmpdir(), 'forge-fixture-')));
  const remote = `${root}-remote.git`;
  const dataHome = `${root}-home`;
  if (!dir) {
    trackTemp(remote);
    trackTemp(dataHome);
  }

  writeProjectFiles(root);
  writeFileSync(join(root, '.gitignore'), 'node_modules/\n');

  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Fixture');
  git(root, 'config', 'user.email', 'fixture@localhost');
  git(root, 'config', 'core.autocrlf', 'false');
  git(root, 'add', '-A');
  git(root, 'commit', '-m', 'fixture: initial commit');

  mkdirSync(remote, { recursive: true });
  git(remote, 'init', '--bare', '-b', 'main');
  git(root, 'push', remote, 'main');

  return {
    root,
    remote,
    dataHome,
    dispose: () => removeAll([root, remote, dataHome]),
  };
}
