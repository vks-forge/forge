/**
 * Pins: the hook judges where a path tool call really points, not only how it is spelled.
 *
 * Why: the path floors that keep a Worker out of Forge's data home are lexical. A Worker can
 *   create a junction (Windows) or symlink inside its own worktree that points at the data
 *   home and then `Read` `<worktree>/link/forge.db`; spelled that way the path looks like
 *   part of the worktree. The hook handler resolves path arguments with the filesystem and
 *   asks `admit()` a second time with the physical paths, denying if either look denies.
 *   These tests use a real junction or symlink in a temp directory, and still require that
 *   ordinary reads and writes of new files inside the worktree pass.
 *
 * Pins: PreToolUse for `Read` through a link into the data home, a data home named through a
 *   link, files that do not exist yet, and ordinary worktree files.
 * Depends on: helpers/fixtures, node:fs, vitest. IO: a temp directory.
 */

import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RUN_ID, TOKEN, makeEnv, preWith } from '#tests/helpers/fixtures.js';

const LINK_TYPE = process.platform === 'win32' ? 'junction' : 'dir';

let base: string;
let home: string;
let wt: string;

beforeAll(() => {
  base = realpathSync.native(mkdtempSync(join(tmpdir(), 'forge-phys-')));
  home = join(base, 'forge-home');
  wt = join(home, 'worktrees', 't1');
  mkdirSync(join(wt, 'src'), { recursive: true });
  writeFileSync(join(home, 'forge.db'), 'secret');
  writeFileSync(join(wt, 'src', 'a.ts'), 'export {};');
  symlinkSync(home, join(wt, 'link'), LINK_TYPE);
  symlinkSync(home, join(base, 'home-alias'), LINK_TYPE);
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

async function read(file: string, dataHome = home, tool = 'Read') {
  const env = makeEnv({ real: { dataHome, cwd: wt } });
  await env.ready;
  const res = await env.handler.handle(RUN_ID, TOKEN, {
    event: 'PreToolUse',
    payload: preWith(tool, { file_path: file }, 'tu1'),
    seq: 1,
  });

  env.close();

  return res;
}

describe('hook handler resolves path arguments before admit()', () => {
  it('denies a read through a link inside the worktree that points at the data home', async () => {
    const res = await read(join(wt, 'link', 'forge.db'));

    expect(res.decision).toBe('deny');
  });

  it('denies the same read when the link is given as a relative path', async () => {
    const res = await read('link/forge.db');

    expect(res.decision).toBe('deny');
  });

  it('denies a write through the link, even to a file that does not exist yet', async () => {
    const res = await read(join(wt, 'link', 'new.txt'), home, 'Write');

    expect(res.decision).toBe('deny');
  });

  it('denies when the data home itself is named through a link', async () => {
    const res = await read(join(home, 'forge.db'), join(base, 'home-alias'));

    expect(res.decision).toBe('deny');
  });

  it('still allows a file inside the worktree', async () => {
    expect((await read(join(wt, 'src', 'a.ts'))).decision).toBe('allow');
    expect((await read('src/a.ts')).decision).toBe('allow');
  });

  it('still allows a file that does not exist yet, under a directory that does not either', async () => {
    const res = await read(join(wt, 'brand', 'new', 'file.ts'), home, 'Write');

    expect(res.decision).toBe('allow');
  });
});
