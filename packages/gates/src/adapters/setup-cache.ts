/**
 * Setup cache — stores a setup step's install folders once and copies them into later worktrees.
 *
 * Why: two tickets of one project with the same lockfile paid the same 80 to 230 second install
 *   twice. When a recipe marks a step's output folder relocatable (`node_modules`, `vendor`),
 *   Forge keeps a copy under `<cache>/setup/<key>/` after the first successful run and copies it
 *   into the next worktree whose key matches, so the install command does not run at all. The cache
 *   must never be the reason a ticket fails or a Worker sees half an install: an entry is built in a
 *   temporary folder and renamed into place only when complete, a restore that fails part way
 *   removes what it copied, and every error is returned as "no hit" so the step runs normally.
 *   The size budget evicts the least recently used entries (a restore refreshes an entry's time).
 *   Copies use copy-on-write where the filesystem has it and keep symlinks as written, which is
 *   what makes npm's `.bin` links and pnpm's store links survive the move.
 *
 * Exports: restoreEntry(), storeEntry(), evictOverBudget(), entryPath(), DEFAULT_BUDGET_BYTES.
 * Depends on: node:fs, node:fs/promises, node:path, @forge/core (SetupStep), types/worktree-preparer.
 *   IO: reads and writes the cache folder and the worktree.
 */

import { constants } from 'node:fs';
import {
  cp,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import type { CacheEntryMeta } from '#/types/worktree-preparer.types.js';

const GB = 1024 ** 3;
const HOUR_MS = 3_600_000;
const META = 'meta.json';

export const DEFAULT_BUDGET_BYTES = 5 * GB;

/** The folder of the entry stored under `key`. */
export const entryPath = (cacheDir: string, key: string): string =>
  join(cacheDir, 'setup', key);

const copyTree = (from: string, to: string): Promise<void> =>
  cp(from, to, {
    recursive: true,
    verbatimSymlinks: true,
    mode: constants.COPYFILE_FICLONE,
  });

const exists = (p: string): Promise<boolean> =>
  stat(p).then(
    () => true,
    () => false,
  );

async function sizeOf(path: string): Promise<number> {
  const s = await stat(path).catch(() => null);
  if (s === null) {
    return 0;
  }

  if (!s.isDirectory()) {
    return s.size;
  }

  let total = 0;
  for (const name of await readdir(path)) {
    total += await sizeOf(join(path, name));
  }

  return total;
}

/**
 * Copies the entry for `key` into `folder`. True on a hit. False on a miss, a damaged entry, or
 * when an output folder is already there (never overwrite what the tree holds); a half copy is removed.
 */
export async function restoreEntry(
  cacheDir: string,
  key: string,
  folder: string,
  outputs: readonly string[],
): Promise<boolean> {
  const dir = entryPath(cacheDir, key);
  const meta = await readFile(join(dir, META), 'utf8').then(
    (t) => JSON.parse(t) as Partial<CacheEntryMeta>,
    () => null,
  );

  if (meta?.key !== key || outputs.length === 0) {
    return false;
  }

  for (const out of outputs) {
    if ((await exists(join(folder, out))) || !(await exists(join(dir, 'out', out)))) {
      return false;
    }
  }

  const made: string[] = [];
  try {
    for (const out of outputs) {
      made.push(join(folder, out));
      await mkdir(join(folder, out, '..'), { recursive: true });
      await copyTree(join(dir, 'out', out), join(folder, out));
    }

    const now = new Date();
    await utimes(join(dir, META), now, now);

    return true;
  } catch {
    await Promise.all(made.map((p) => rm(p, { recursive: true, force: true })));

    return false;
  }
}

/**
 * Stores `outputs` of `folder` as the entry for `key`. False (and nothing kept) when an output is
 * missing, the copy fails, or another store won the race; never throws.
 */
export async function storeEntry(
  cacheDir: string,
  key: string,
  folder: string,
  outputs: readonly string[],
): Promise<boolean> {
  const final = entryPath(cacheDir, key);
  const tmp = `${final}.tmp-${process.pid}-${Date.now()}`;
  try {
    if ((await exists(final)) || outputs.length === 0) {
      return false;
    }

    for (const out of outputs) {
      if (!(await exists(join(folder, out)))) {
        return false;
      }
    }

    for (const out of outputs) {
      await mkdir(join(tmp, 'out', out, '..'), { recursive: true });
      await copyTree(join(folder, out), join(tmp, 'out', out));
    }

    const meta: CacheEntryMeta = { key, bytes: await sizeOf(join(tmp, 'out')), outputs };
    await writeFile(join(tmp, META), JSON.stringify(meta));
    await rename(tmp, final);

    return true;
  } catch {
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined);

    return false;
  }
}

/**
 * Deletes least recently used entries until the rest fit in `budgetBytes`, and leftovers of
 * stores that died part way (a `.tmp-` folder older than an hour). Returns the keys removed.
 */
export async function evictOverBudget(
  cacheDir: string,
  budgetBytes: number,
  now: number = Date.now(),
): Promise<string[]> {
  const root = join(cacheDir, 'setup');
  const names = await readdir(root).catch(() => []);
  const entries: { name: string; bytes: number; used: number }[] = [];
  for (const name of names) {
    const dir = join(root, name);
    if (name.includes('.tmp-')) {
      const age = now - ((await stat(dir).catch(() => null))?.mtimeMs ?? now);
      if (age > HOUR_MS) {
        await rm(dir, { recursive: true, force: true });
      }

      continue;
    }

    const s = await stat(join(dir, META)).catch(() => null);
    const meta = await readFile(join(dir, META), 'utf8').then(
      (t) => JSON.parse(t) as Partial<CacheEntryMeta>,
      () => null,
    );

    if (s === null || typeof meta?.bytes !== 'number') {
      // No readable meta: a damaged entry is never restorable, so it only costs space.
      await rm(dir, { recursive: true, force: true });
      continue;
    }

    entries.push({ name, bytes: meta.bytes, used: s.mtimeMs });
  }

  const removed: string[] = [];
  let total = entries.reduce((n, e) => n + e.bytes, 0);
  for (const e of entries.sort((a, b) => a.used - b.used)) {
    if (total <= budgetBytes) {
      break;
    }

    await rm(join(root, e.name), { recursive: true, force: true });
    total -= e.bytes;
    removed.push(e.name);
  }

  return removed;
}
