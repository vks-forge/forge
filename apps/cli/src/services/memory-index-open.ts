/**
 * Opens the local search index of a markdown memory folder, rebuilding it when a record changed.
 *
 * Why: this repository's own `.forge/memory` stays markdown in git (the truth), but a session should search it
 *   with the product's own search. The index is a SQLite file in `<folder>/.index/` (git-ignored) built by the
 *   product's own code (the same migrations, the same lenient parser, the same index). Stored records can never
 *   be updated in place, so a change to any file rebuilds the whole index aside, in a temp file, and swaps it in
 *   by rename: a reader never sees a half-built index and a crash leaves the old one. What changed is decided
 *   cheaply from a manifest (one stat per file, a hash only where size or time moved). A missing, unreadable or
 *   corrupt index is simply rebuilt, because the markdown is the truth. Nothing is written outside `.index/`.
 *   This file loads the database and memory packages, so `main.ts` imports it only when a memory command runs and
 *   `forge start | open | status | stop` pay nothing for it.
 *
 * Exports: openLocalMemoryIndex(), INDEX_DIR_NAME.
 * Depends on: node:fs/promises, node:path, @forge/db, @forge/memory, @forge/core (types), types/cli.
 *   IO: reads the memory folder, writes under `<folder>/.index/`.
 */

import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createSqliteStorage } from '@forge/db';
import { createSqlMemoryIndex, loadMarkdownInto, scanMarkdown } from '@forge/memory';
import type { MarkdownManifest } from '@forge/memory';
import type { OpenedMemoryIndex } from '#/types/cli.types.js';

export const INDEX_DIR_NAME = '.index';
const PROJECT = 'forge';
const EXTRAS = ['', '-wal', '-shm'] as const;

async function readManifest(path: string): Promise<MarkdownManifest | null> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as MarkdownManifest;

    return parsed.version === 1 && Array.isArray(parsed.files) ? parsed : null;
  } catch {
    return null;
  }
}

const removeIndexFiles = async (base: string): Promise<void> => {
  for (const extra of EXTRAS) {
    await rm(`${base}${extra}`, { force: true });
  }
};

/** Builds the index into a temp file and swaps it in; the manifest is written last. */
async function rebuild(
  dir: string,
  dbPath: string,
  manifestPath: string,
  manifest: MarkdownManifest,
  now: () => Date,
): Promise<void> {
  const temp = join(dir, INDEX_DIR_NAME, `memory-${process.pid}-${Date.now()}.tmp`);
  await removeIndexFiles(temp);

  const storage = createSqliteStorage(temp);
  try {
    await loadMarkdownInto(storage, dir, PROJECT, now());
  } finally {
    await storage.close();
  }

  await removeIndexFiles(dbPath);
  await rename(temp, dbPath);
  await removeIndexFiles(temp);

  const tmpManifest = `${manifestPath}.${process.pid}.tmp`;
  await writeFile(tmpManifest, JSON.stringify(manifest), 'utf8');
  await rename(tmpManifest, manifestPath);
}

/** Opens (building or rebuilding first when needed) the index of the markdown folder `dir`. */
export async function openLocalMemoryIndex(
  dir: string,
  now: () => Date = () => new Date(),
): Promise<OpenedMemoryIndex> {
  const indexDir = join(dir, INDEX_DIR_NAME);
  const dbPath = join(indexDir, 'memory.sqlite');
  const manifestPath = join(indexDir, 'files.json');
  await mkdir(indexDir, { recursive: true });

  const scan = await scanMarkdown(dir, await readManifest(manifestPath));
  let rebuilt = false;
  let storage;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const missing = await stat(dbPath).then(
      () => false,
      () => true,
    );

    if (missing || scan.changed || attempt > 0) {
      await rebuild(dir, dbPath, manifestPath, scan.manifest, now);
      rebuilt = true;
    } else {
      // Unchanged content but new times: remember them so the next run hashes nothing.
      await writeFile(manifestPath, JSON.stringify(scan.manifest), 'utf8');
    }

    try {
      storage = createSqliteStorage(dbPath);
      break;
    } catch (error) {
      // A damaged index is not an error: the markdown is the truth, so it is built again once.
      if (attempt === 1) {
        throw error;
      }
    }
  }

  const open = storage as ReturnType<typeof createSqliteStorage>;

  return {
    index: createSqlMemoryIndex({ storage: open, now }),
    rebuilt,
    close: () => open.close(),
  };
}
