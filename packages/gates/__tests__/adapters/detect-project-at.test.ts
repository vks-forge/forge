/**
 * Pins: detectProjectAt() reads a real folder and never fails on one it cannot read.
 *
 * Why: the new-project form calls this on whatever folder the user typed; a missing folder or
 *   a broken package.json must give an empty suggestion so the user can still type checks by hand.
 *
 * Depends on: src/adapters/detect-project-at, node:fs, node:os.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { detectProjectAt } from '#/adapters/detect-project-at.js';

const made: string[] = [];
const temp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'forge detect '));
  made.push(dir);

  return dir;
};

afterEach(() => {
  for (const dir of made.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('detectProjectAt', () => {
  it('reads the root and its package.json', async () => {
    const dir = temp();
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'x' } }));

    expect(await detectProjectAt(dir)).toEqual({
      ecosystems: ['node'],
      checks: [{ name: 'test', role: 'test', command: 'npm run test' }],
      setup: [
        expect.objectContaining({
          command: 'npm install --no-package-lock --no-audit --no-fund',
        }),
      ],
    });
  });

  it('keeps the ecosystem but suggests no check when package.json is not JSON', async () => {
    const dir = temp();
    writeFileSync(join(dir, 'package.json'), '{ nope');

    expect(await detectProjectAt(dir)).toMatchObject({
      ecosystems: ['node'],
      checks: [],
    });
  });

  it('gives an empty result for a folder that does not exist', async () => {
    expect(await detectProjectAt(join(tmpdir(), 'forge-no-such-folder-xyz'))).toEqual({
      ecosystems: [],
      checks: [],
      setup: [],
    });
  });

  it("finds a monorepo's lockfile at the repository top for a project in a subfolder", async () => {
    const top = temp();
    const sub = join(top, 'apps', 'web');
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(top, 'pnpm-lock.yaml'), '');
    writeFileSync(join(sub, 'package.json'), '{}');

    const found = await detectProjectAt(sub, top);

    expect(found.ecosystems).toEqual(['node']);
    expect(found.setup).toMatchObject([
      { command: 'pnpm install --frozen-lockfile', at_repo_root: true },
    ]);
  });

  it('reads one folder when the repository top is the project folder or cannot be read', async () => {
    const dir = temp();
    writeFileSync(join(dir, 'go.mod'), 'module x');

    const same = await detectProjectAt(dir, dir);
    const missing = await detectProjectAt(dir, join(dir, 'nope'));

    expect(same.setup.map((s) => s.command)).toEqual(['go mod download']);
    expect(missing.setup).toEqual(same.setup);
  });
});
