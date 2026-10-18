/**
 * Pins how `forge memory` finds the folder of records it reads.
 *
 * Why: a session runs from some folder inside the Forge checkout, not necessarily its root, and must read this
 *   repository's own records, never another project's: the folder is the first `.forge/memory` found walking up
 *   from the current folder, else the one under `FORGE_ROOT`, and `--dir` names one outright. Nothing else is
 *   guessed, so an unrelated `.forge/memory` somewhere else on the machine is never read by accident, and a
 *   missing folder says where it looked.
 *
 * Pins: the walk up, `FORGE_ROOT` as the fallback, the error naming where it looked, `--dir` taken outright and
 *   refused when it is not a folder.
 * Depends on: src/services/memory-dir, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import { findMemoryDir } from '#/services/memory-dir.js';

describe('finding the folder', () => {
  const at = (dirs: string[], cwd: string, env: Record<string, string> = {}) =>
    findMemoryDir({
      cwd,
      env,
      isDir: async (p) => dirs.some((d) => p.replace(/\\/g, '/').endsWith(d)),
    });

  it('walks up from the current folder, then tries FORGE_ROOT, and says where it looked', async () => {
    expect(
      (await at(['/repo/.forge/memory'], '/repo/apps/cli')).replace(/\\/g, '/'),
    ).toMatch(/\/repo\/\.forge\/memory$/);

    expect(
      (await at(['/root/.forge/memory'], '/elsewhere', { FORGE_ROOT: '/root' })).replace(
        /\\/g,
        '/',
      ),
    ).toMatch(/\/root\/\.forge\/memory$/);

    await expect(at([], '/elsewhere')).rejects.toThrow(
      'no .forge/memory found above /elsewhere',
    );
  });

  it('takes --dir outright and refuses one that is not a folder', async () => {
    expect(
      (
        await findMemoryDir({ cwd: '/repo', env: {}, isDir: async () => true }, 'mem')
      ).replace(/\\/g, '/'),
    ).toMatch(/\/repo\/mem$/);

    await expect(
      findMemoryDir({ cwd: '/repo', env: {}, isDir: async () => false }, 'mem'),
    ).rejects.toThrow('--dir mem is not a folder');
  });
});
