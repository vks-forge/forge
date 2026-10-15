/**
 * Pins: detectProject() suggests ecosystems and checks from a repository root, and nothing it cannot back.
 *
 * Why: the new-project form pre-fills the project's checks from this; a wrong suggestion
 *   (a script the repository does not have) would make every gate run fail, so a check is
 *   only suggested when the manifest names it.
 *
 * Depends on: src/domain/detect-project.
 */

import { describe, expect, it } from 'vitest';
import { detectProject } from '#/domain/detect-project.js';

describe('detectProject', () => {
  it('suggests the package scripts that exist, run with the manager the lockfile names', () => {
    const result = detectProject({
      rootEntries: ['package.json', 'pnpm-lock.yaml', 'src'],
      packageJson: { scripts: { test: 'vitest', lint: 'eslint .', dev: 'vite' } },
    });

    expect(result.ecosystems).toEqual(['node']);
    expect(result.checks).toEqual([
      { name: 'lint', role: 'lint', command: 'pnpm run lint' },
      { name: 'test', role: 'test', command: 'pnpm run test' },
    ]);
  });

  it('falls back to npm without a lockfile and suggests nothing without scripts', () => {
    const withScript = detectProject({
      rootEntries: ['package.json'],
      packageJson: { scripts: { build: 'tsc' } },
    });

    expect(withScript.checks).toEqual([
      { name: 'build', role: 'build', command: 'npm run build' },
    ]);

    expect(detectProject({ rootEntries: ['package.json'] }).checks).toEqual([]);
  });

  it('knows go and rust by their marker files', () => {
    expect(detectProject({ rootEntries: ['go.mod', 'main.go'] })).toMatchObject({
      ecosystems: ['go'],
      checks: [
        { command: 'go vet ./...' },
        { command: 'go test ./...' },
        { command: 'go build ./...' },
      ],
    });

    expect(detectProject({ rootEntries: ['Cargo.toml'] }).ecosystems).toEqual(['rust']);
  });

  it('finds no ecosystem in a folder with only docs', () => {
    expect(detectProject({ rootEntries: ['README.md', 'LICENSE'] })).toEqual({
      ecosystems: [],
      checks: [],
    });
  });
});
