/**
 * Tests for `computeStepCacheKey`, the fingerprint of a restorable install.
 *
 * Why: a restore hands a worktree a folder the command did not just build, so the key must change
 *   with anything that could change the result: the command, where it runs, any byte of a lockfile
 *   or manifest, the toolchain (a different Node builds different native modules), the OS and the
 *   CPU. If it were too loose a ticket would test against stale or foreign packages; the same
 *   inputs in a second worktree must give the same key or nothing would ever be reused.
 *
 * Pins: same inputs in two folders give one key; each of command, cwd, an input byte, a missing
 *   input, toolchain, platform and arch changes it.
 * Depends on: adapters/prep-key, @forge/core (SetupStep), node:fs, node:os, node:path, vitest.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SetupStep } from '@forge/core';
import { afterEach, describe, expect, it } from 'vitest';
import { computeStepCacheKey } from '#/adapters/prep-key.js';

const made: string[] = [];
afterEach(() => {
  for (const d of made.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

function tree(lock = 'lock-v1'): string {
  const dir = mkdtempSync(join(tmpdir(), 'forge key '));
  made.push(dir);
  writeFileSync(join(dir, 'package-lock.json'), lock);

  return dir;
}

const step = (over: Record<string, unknown> = {}): SetupStep =>
  SetupStep.parse({
    name: 'Install packages',
    command: 'npm ci',
    inputs: ['package-lock.json', 'package.json'],
    cache_outputs: ['node_modules'],
    ...over,
  });

const key = (
  s: SetupStep,
  dir: string,
  toolchain = 'v22',
  platform = 'win32',
  arch = 'x64',
): Promise<string> => computeStepCacheKey(s, dir, toolchain, platform, arch);

describe('computeStepCacheKey', () => {
  it('is the same for the same inputs in another worktree', async () => {
    expect(await key(step(), tree())).toBe(await key(step(), tree()));
  });

  it('changes with one byte of an input file', async () => {
    expect(await key(step(), tree('a'))).not.toBe(await key(step(), tree('b')));
  });

  it('changes when an input file appears or disappears', async () => {
    const a = tree();
    const b = tree();
    writeFileSync(join(b, 'package.json'), '{}');

    expect(await key(step(), a)).not.toBe(await key(step(), b));
  });

  it.each([
    ['command', { command: 'npm install' }],
    ['folder', { cwd: 'web' }],
    ['outputs', { cache_outputs: ['node_modules', 'vendor'] }],
  ])('changes with the step %s', async (_n, over) => {
    const dir = tree();

    expect(await key(step(over), dir)).not.toBe(await key(step(), dir));
  });

  it('changes with the toolchain, the OS and the CPU', async () => {
    const dir = tree();
    const base = await key(step(), dir);

    expect(await key(step(), dir, 'v24')).not.toBe(base);
    expect(await key(step(), dir, 'v22', 'linux')).not.toBe(base);
    expect(await key(step(), dir, 'v22', 'win32', 'arm64')).not.toBe(base);
  });
});
