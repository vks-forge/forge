/**
 * `installedBuild`: the installed harness build, read once per file state.
 *
 * Why: the server asks which build is installed before every Worker starts, to refuse a run
 *   on a build whose tool approvals it never loaded (an in-place upgrade while Forge runs).
 *   A `--version` child per run would add a process spawn to every start, so the answer is
 *   cached by executable path, modification time and size; a replaced binary changes the
 *   file and is read again, and a failed read is never cached.
 *
 * Pins: a second ask for an unchanged file spawns nothing; touching or resizing the file
 *   spawns again and returns the new build; a missing version is retried; a path that cannot
 *   be stat-ed is not cached.
 * Depends on: src/compat/run-installed, helpers/fake-child, helpers/temp. IO: temp files.
 */

import { utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearBuildCache, installedBuild } from '#/compat/run-installed.js';
import { systemClock } from '#/adapters/claude/system.js';
import { createFakeChild } from '#tests/helpers/fake-child.js';
import { makeTempDir } from '#tests/helpers/temp.js';

function setup(printed: () => string | null) {
  const dir = makeTempDir('forge-build-');
  const binary = join(dir, 'claude.exe');
  writeFileSync(binary, 'v1');
  const spawns: string[] = [];

  const deps = {
    source: () => ({ id: 'claude-code', binaryPath: binary, authMode: 'login' as const }),
    spawn: ((cmd: string) => {
      spawns.push(cmd);
      const child = createFakeChild();
      const out = printed();
      if (out !== null) {
        child.stdoutPipe.write(`${out}\n`);
      }

      child.exit(0);

      return child;
    }) as never,
    clock: systemClock,
    engine: 'cli' as const,
    baseEnv: {},
  };

  return { binary, spawns, deps };
}

beforeEach(() => clearBuildCache());

describe('installedBuild', () => {
  it('spawns `--version` once for a file that has not changed', async () => {
    const t = setup(() => 'Claude Code 2.1.0');

    const first = await installedBuild(t.deps);
    const second = await installedBuild(t.deps);

    expect(first.version).toBe('2.1.0');
    expect(second.version).toBe('2.1.0');
    expect(t.spawns).toHaveLength(1);
  });

  it('reads the build again when the file was replaced in place', async () => {
    let printed = 'Claude Code 2.1.0';
    const t = setup(() => printed);
    await installedBuild(t.deps);

    printed = 'Claude Code 2.2.0';
    writeFileSync(t.binary, 'a longer v2 binary');
    utimesSync(t.binary, new Date(), new Date(Date.now() + 5_000));

    const after = await installedBuild(t.deps);

    expect(after.version).toBe('2.2.0');
    expect(t.spawns).toHaveLength(2);
  });

  it('does not cache a build that printed no version', async () => {
    let printed: string | null = null;
    const t = setup(() => printed);

    expect((await installedBuild(t.deps)).version).toBeNull();
    printed = 'Claude Code 2.1.0';

    expect((await installedBuild(t.deps)).version).toBe('2.1.0');
    expect(t.spawns).toHaveLength(2);
  });
});
