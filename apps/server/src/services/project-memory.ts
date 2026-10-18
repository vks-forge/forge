/**
 * Composes project memory: the Director's writer and reader, the memory index, the old whole-slice port, the
 * one-time migration and the owner's admin actions.
 *
 * Why: each project's memory lives in the database, behind one door for every write and one index for every
 *   read. Projects registered before this release still hold a private git repository; their memory is moved
 *   in once (see memory-migration) and until a project is proven it keeps working from its files. All of it
 *   is behind the same ports, and which backend a project uses is decided here, on every call, from the
 *   import log and whether the old repository is still there, so a project switches the moment its import is
 *   verified. The database side runs on the tracked storage, so a memory write or an import announces
 *   `["memory", slug]` to the open screens.  Composing also runs the start-up work: the move of
 *   old repositories, the pruning of the access log and the teaching of the built-in tools to a saved catalogue.
 *   A memory folder that cannot be read never keeps the server from starting: the project is served from what is
 *   readable and the problem is logged.
 *
 * Exports: composeProjectMemory().
 * Depends on: @forge/memory, @forge/tools (syncSeedEntries), services/memory-admin, services/memory-backup,
 *   services/memory-migration, types/memory-admin. IO: the memory folder and the database through the storage.
 */

import { join } from 'node:path';
import { syncSeedEntries } from '@forge/tools';
import {
  createFileMemorySource,
  createMemoryImporter,
  createProjectMemory,
  createRoutedMemory,
  createSqlMemoryIndex,
  createSqlProjectMemory,
  hasRepo,
  pruneAccessLog,
} from '@forge/memory';
import type { MemoryBackend } from '@forge/memory';
import { createMemoryAdmin } from '#/services/memory-admin.js';
import { backupBeforeMemoryMigration } from '#/services/memory-backup.js';
import { createMemoryMigration } from '#/services/memory-migration.js';
import type { ComposeMemoryInput, MemoryParts } from '#/types/memory-admin.types.js';

export async function composeProjectMemory(
  input: ComposeMemoryInput,
): Promise<MemoryParts> {
  const { storage, dataHome, log } = input;
  const clock = (): Date => new Date(input.now());
  const onSkip = (path: string, reason: string): void =>
    log('warn', 'memory record skipped', { path, reason });

  const files = createProjectMemory({ rootDir: dataHome.memoryDir, now: clock, onSkip });
  const fileSource = createFileMemorySource(dataHome.memoryDir, { onSkip });
  const importer = createMemoryImporter({
    storage,
    rootDir: dataHome.memoryDir,
    now: clock,
  });

  // Once a project is on the database it never goes back, so that answer is remembered.
  const onDatabase = new Set<string>();
  const stateOf = async (slug: string): Promise<MemoryBackend> => {
    if (onDatabase.has(slug)) {
      return 'db';
    }

    const record = await storage.transaction((tx) => tx.memory.importState(slug));
    if (record?.state === 'verified') {
      onDatabase.add(slug);

      return 'db';
    }

    // No old repository (a project made after this release, or one already moved): the database.
    return (await hasRepo(join(dataHome.memoryDir, slug))) ? 'files' : 'db';
  };

  const routed = createRoutedMemory({
    db: createSqlProjectMemory({ storage, now: clock }),
    dbIndex: createSqlMemoryIndex({ storage, now: clock }),
    files,
    fileSource,
    stateOf,
  });

  const migration = createMemoryMigration({
    storage,
    importer,
    rootDir: dataHome.memoryDir,
    backup: (slugs) =>
      backupBeforeMemoryMigration({
        dbPath: dataHome.dbPath,
        backupsDir: dataHome.backupsDir,
        memoryDir: dataHome.memoryDir,
        slugs,
        now: clock,
      }),
    now: clock,
    log,
  });

  // Before any socket and any tick: a failure is logged and recorded, and that project stays on its repository.
  await migration.migrateAll(input.slugs);
  const warn = (what: string) => (error: unknown) =>
    log('warn', what, { error: error instanceof Error ? error.message : String(error) });

  await pruneAccessLog(storage, input.slugs, clock()).catch(
    warn('memory access log could not be pruned'),
  );

  // A catalogue saved by an earlier release learns the built-in tools it has never held (the memory tools).
  if (input.catalogue !== undefined) {
    await syncSeedEntries(input.catalogue).catch(
      warn('built-in tools could not be added to the catalogue'),
    );
  }

  const admin = createMemoryAdmin({
    storage,
    stateOf,
    migration,
    memoryDir: dataHome.memoryDir,
    exportsDir: join(dataHome.home, 'exports'),
    now: clock,
  });

  return {
    memory: routed.memory,
    index: routed.index,
    source: routed.source,
    migration,
    admin,
    forEngine: { memory: routed.source, memoryIndex: routed.index },
    forRoutes: { memory: routed.memory, memoryIndex: routed.index, memoryAdmin: admin },
  };
}
