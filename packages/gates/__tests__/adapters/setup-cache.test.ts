/**
 * Tests for the setup cache store: restore, store, partial entries and eviction.
 *
 * Why: the cache hands an install folder to a worktree without running the command, so a damaged
 *   or half-written entry must never be used, a restore must never overwrite what a tree already
 *   holds or leave half a folder behind, and the cache must stay within its size budget by dropping
 *   what was used longest ago. A fault here must show up as "no hit" (the step then runs), never as
 *   a thrown error or a broken tree.
 *
 * Pins: a stored folder restores with its nested files; a miss is false; an entry without its
 *   meta (a partial store) is not used and is cleaned on eviction; an existing output folder is not
 *   overwritten; a missing output is not stored; a second store of one key is a no-op; eviction
 *   removes least recently used entries first until within budget, and old temporary folders of
 *   crashed stores.
 * Depends on: adapters/setup-cache, node:fs, node:os, node:path, vitest.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  entryPath,
  evictOverBudget,
  restoreEntry,
  storeEntry,
} from '#/adapters/setup-cache.js';

const made: string[] = [];
afterEach(() => {
  for (const d of made.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

const dir = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'forge cache '));
  made.push(d);

  return d;
};

function worktree(content = 'x'.repeat(100)): string {
  const w = dir();
  mkdirSync(join(w, 'node_modules', 'pkg'), { recursive: true });
  writeFileSync(join(w, 'node_modules', 'pkg', 'index.js'), content);

  return w;
}

const read = (w: string): string =>
  readFileSync(join(w, 'node_modules', 'pkg', 'index.js'), 'utf8');

const K1 = 'a'.repeat(64);
const K2 = 'b'.repeat(64);

describe('store and restore', () => {
  it('copies a stored folder into another worktree', async () => {
    const cache = dir();
    const target = dir();

    expect(await storeEntry(cache, K1, worktree('hello'), ['node_modules'])).toBe(true);
    expect(await restoreEntry(cache, K1, target, ['node_modules'])).toBe(true);

    expect(read(target)).toBe('hello');
  });

  it('is a miss for a key never stored', async () => {
    expect(await restoreEntry(dir(), K1, dir(), ['node_modules'])).toBe(false);
  });

  it('does not store when an output folder is missing', async () => {
    const cache = dir();

    expect(await storeEntry(cache, K1, dir(), ['node_modules'])).toBe(false);
    expect(existsSync(entryPath(cache, K1))).toBe(false);
  });

  it('keeps the first entry when the same key is stored twice', async () => {
    const cache = dir();
    await storeEntry(cache, K1, worktree('first'), ['node_modules']);

    expect(await storeEntry(cache, K1, worktree('second'), ['node_modules'])).toBe(false);

    const target = dir();
    await restoreEntry(cache, K1, target, ['node_modules']);
    expect(read(target)).toBe('first');
  });

  it('never uses a partial entry (no meta file)', async () => {
    const cache = dir();
    mkdirSync(join(entryPath(cache, K1), 'out', 'node_modules'), { recursive: true });

    expect(await restoreEntry(cache, K1, dir(), ['node_modules'])).toBe(false);
  });

  it('does not overwrite an output folder the tree already has', async () => {
    const cache = dir();
    await storeEntry(cache, K1, worktree('cached'), ['node_modules']);
    const target = worktree('mine');

    expect(await restoreEntry(cache, K1, target, ['node_modules'])).toBe(false);
    expect(read(target)).toBe('mine');
  });
});

describe('evictOverBudget', () => {
  async function two(): Promise<string> {
    const cache = dir();
    await storeEntry(cache, K1, worktree(), ['node_modules']);
    await storeEntry(cache, K2, worktree(), ['node_modules']);
    const old = new Date(Date.now() - 100_000);
    utimesSync(join(entryPath(cache, K1), 'meta.json'), old, old);

    return cache;
  }

  it('removes the least recently used entry first', async () => {
    const cache = await two();

    expect(await evictOverBudget(cache, 150)).toEqual([K1]);
    expect(existsSync(entryPath(cache, K2))).toBe(true);
  });

  it('keeps everything within budget', async () => {
    expect(await evictOverBudget(await two(), 10_000)).toEqual([]);
  });

  it('a restore counts as a use', async () => {
    const cache = await two();
    await restoreEntry(cache, K1, dir(), ['node_modules']);

    expect(await evictOverBudget(cache, 150)).toEqual([K2]);
  });

  it('cleans damaged entries and old temporary folders of crashed stores', async () => {
    const cache = dir();
    mkdirSync(entryPath(cache, K1), { recursive: true });
    const tmp = `${entryPath(cache, K2)}.tmp-1-2`;
    mkdirSync(tmp, { recursive: true });
    const old = new Date(Date.now() - 7_200_000);
    utimesSync(tmp, old, old);

    await evictOverBudget(cache, 1_000_000);

    expect(existsSync(entryPath(cache, K1))).toBe(false);
    expect(existsSync(tmp)).toBe(false);
  });
});
