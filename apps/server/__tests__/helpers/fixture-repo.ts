/**
 * A throwaway target repository with a local bare remote and a `.forge/` config.
 *
 * Why: the end-to-end test and the live probe must run the real worktree manager, the real
 *   `local-bare` git host and the real G1 gate against a real repository, never against
 *   mocks of git. This builds the smallest repository those need: a node-only project whose
 *   `test` and `lint` scripts need no install, a source file and a test file, a bare
 *   repository standing in for the remote with `main` pushed, and the signed tool catalogue
 *   copied in, so `loadSettings()` is exercised exactly as in production. The repository
 *   is registered like a user would: `fixtureProjectBody()` is the `POST /projects` body for
 *   it. Forge's data home is a sibling temp directory, never inside the repository.
 *   Everything lives under the OS temp directory (or a directory the caller names) and is
 *   removed by `dispose()`.
 *
 * Exports: FixtureRepo, createFixtureRepo(), fixtureProjectBody(), git().
 * Depends on: node:child_process, node:fs, node:os, node:path. IO: creates directories and runs git.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackTemp } from '#tests/helpers/temp.js';

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

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
      profile: 'generic',
      commands: { test: 'npm test', lint: 'node scripts/lint.mjs' },
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

  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'test'), { recursive: true });
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, '.forge', 'tools'), { recursive: true });

  const pkg = {
    name: 'fixture',
    version: '1.0.0',
    private: true,
    type: 'module',
    scripts: { test: 'node --test', lint: 'node scripts/lint.mjs' },
  };

  writeFileSync(join(root, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
  writeFileSync(join(root, 'src', 'math.js'), SOURCE);
  writeFileSync(join(root, 'test', 'math.test.js'), TEST);
  writeFileSync(join(root, 'scripts', 'lint.mjs'), LINT);
  writeFileSync(join(root, '.gitignore'), 'node_modules/\n');

  cpSync(
    join(REPO_ROOT, '.forge', 'tools', 'catalog.yaml'),
    join(root, '.forge', 'tools', 'catalog.yaml'),
  );

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
    dispose() {
      for (const path of [root, remote, dataHome]) {
        try {
          rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
        } catch (error) {
          // Windows may still hold a handle for a moment; the file-end cleanup tries again.
          process.stderr.write(
            `fixture cleanup: ${path} not removed yet (${(error as NodeJS.ErrnoException).code ?? 'unknown'})\n`,
          );
        }
      }
    },
  };
}
