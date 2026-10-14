/**
 * A throwaway target repository with a local bare remote and a `.forge/` config.
 *
 * Why: the end-to-end test and the live probe must run the real worktree manager, the real
 *   `local-bare` git host and the real G1 gate against a real repository, never against
 *   mocks of git. This builds the smallest repository those need: a node-only project whose
 *   `test` and `lint` scripts need no install, a source file and a test file, a bare
 *   repository standing in for the remote with `main` pushed, and the server's own config
 *   (`forge.yaml`, `project.yaml`, the signed tool catalogue) copied in, so
 *   `loadSettings()` is exercised exactly as in production. Everything lives under the OS
 *   temp directory (or a directory the caller names) and is removed by `dispose()`.
 *
 * Exports: FixtureRepo, createFixtureRepo(), git().
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

/** `dir` defaults to a fresh temp directory; pass one to keep artefacts (the live probe does). */
export function createFixtureRepo(dir?: string): FixtureRepo {
  // A caller-named `dir` is kept on purpose (the live probe keeps it on failure); anything
  // else is removed with its remote when the test file ends, even if dispose() was missed.
  const root = dir ?? trackTemp(mkdtempSync(join(tmpdir(), 'forge-fixture-')));
  const remote = `${root}-remote.git`;
  if (!dir) {
    trackTemp(remote);
  }

  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'test'), { recursive: true });
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, '.forge', 'config'), { recursive: true });
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
  writeFileSync(join(root, '.gitignore'), '.worktrees/\n.forge/data/\nnode_modules/\n');

  cpSync(
    join(REPO_ROOT, '.forge', 'config', 'forge.yaml'),
    join(root, '.forge', 'config', 'forge.yaml'),
  );

  cpSync(
    join(REPO_ROOT, '.forge', 'tools', 'catalog.yaml'),
    join(root, '.forge', 'tools', 'catalog.yaml'),
  );

  writeFileSync(
    join(root, '.forge', 'project.yaml'),
    [
      'slug: fixture',
      'prefix: FX',
      'profile: generic',
      'commands:',
      '  test: npm test',
      '  lint: node scripts/lint.mjs',
      'default_harness: claude-code',
      'git_host:',
      '  kind: local',
      `  remote_path: '${remote.replaceAll('\\', '/')}'`,
      '  base_branch: main',
      '',
    ].join('\n'),
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
    dispose() {
      for (const path of [root, remote]) {
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
