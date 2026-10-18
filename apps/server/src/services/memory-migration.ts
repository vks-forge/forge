/**
 * The move of each project's memory from its old git repository into the database: backup, import, verify, delete.
 *
 * Why: earlier versions kept every project's memory as markdown in a private git repository; this release keeps
 *   it in the database, and the old repository is removed afterwards. Nothing may be lost, so the order is
 *   fixed and each step gates the next: one backup per start (a backup that fails stops the migration for every
 *   project, nothing imported or deleted), then the import with its proof, then, only for a verified project,
 *   the deletion. A project that is not verified stays on its repository, still readable and writable, and is
 *   tried again at the next start or by the owner's Retry. A crash between the import and the deletion leaves
 *   both; the next start proves the copy again and finishes. It runs before the server listens and before the
 *   first tick, and one project's problem never keeps the others from being served: failures are logged and
 *   recorded as a `failed` attempt the screen shows.
 *
 * Exports: createMemoryMigration(), MemoryImportRunningError.
 * Depends on: @forge/core, @forge/memory (hasRepo, repoDirOf, importStatusOf), @forge/engine (Logger type),
 *   types/memory-admin. IO: the injected storage and importer, the memory folder.
 */

import { join } from 'node:path';
import { StallError } from '@forge/core';
import type { MemoryImportRecord } from '@forge/core';
import { hasRepo, importStatusOf } from '@forge/memory';
import type { MemoryMigration, MemoryMigrationDeps } from '#/types/memory-admin.types.js';

/** An import for this project is already running. */
export class MemoryImportRunningError extends StallError {}

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export function createMemoryMigration(deps: MemoryMigrationDeps): MemoryMigration {
  const running = new Set<string>();
  let backupPath: string | null = null;

  const latest = (slug: string) =>
    deps.storage.transaction((tx) => tx.memory.importState(slug));

  const save = (slug: string, record: MemoryImportRecord) =>
    deps.storage.transaction((tx) => tx.memory.saveImport(slug, record));

  /** Records that an attempt could not even start, so the owner sees why and can retry. */
  async function recordFailure(
    slug: string,
    reason: string,
  ): Promise<MemoryImportRecord> {
    const previous = await latest(slug);
    const failed: MemoryImportRecord = {
      attempt: (previous?.attempt ?? 0) + 1,
      at: deps.now().toISOString(),
      state: 'failed',
      head_sha: previous?.head_sha ?? null,
      files: previous?.files ?? 0,
      imported: previous?.imported ?? 0,
      lenient: previous?.lenient ?? 0,
      rejects: previous?.rejects ?? [],
      backup_path: backupPath,
      verified_at: null,
      repo_deleted_at: null,
      message: reason,
    };

    await save(slug, failed);

    return failed;
  }

  const hasOldRepo = (slug: string): Promise<boolean> =>
    hasRepo(join(deps.rootDir, slug));

  /** True when the project still has an old repository and no verified import. */
  async function needsImport(slug: string): Promise<boolean> {
    const record = await latest(slug);

    return record?.state !== 'verified' && (await hasOldRepo(slug));
  }

  async function ensureBackup(slugs: readonly string[]): Promise<string> {
    backupPath ??= await deps.backup(slugs);

    return backupPath;
  }

  async function run(slug: string, slugsForBackup: readonly string[]) {
    const record = await latest(slug);
    if (record?.state === 'verified') {
      // Imported before; a crash may have left the folder. Prove the copy again, then finish the job.
      if (record.repo_deleted_at === null && (await hasOldRepo(slug))) {
        const status = await deps.importer.verify(slug);
        if (status.state === 'verified') {
          await deps.importer.deleteRepo(slug);
        }
      }

      return importStatusOf(await latest(slug));
    }

    if (!(await hasOldRepo(slug))) {
      return importStatusOf(record);
    }

    let path: string;
    try {
      path = await ensureBackup(slugsForBackup);
    } catch (error) {
      return importStatusOf(await recordFailure(slug, message(error)));
    }

    const status = await deps.importer.import(slug, path);
    if (status.state === 'verified') {
      await deps.importer.deleteRepo(slug);
    }

    return importStatusOf(await latest(slug));
  }

  async function migrateOne(slug: string, slugsForBackup: readonly string[]) {
    if (running.has(slug)) {
      throw new MemoryImportRunningError(`an import of ${slug} is already running`);
    }

    running.add(slug);
    try {
      return await run(slug, slugsForBackup);
    } finally {
      running.delete(slug);
    }
  }

  return {
    async migrateAll(slugs) {
      const pending: string[] = [];
      for (const slug of slugs) {
        if (await needsImport(slug).catch(() => false)) {
          pending.push(slug);
        }
      }

      for (const slug of slugs) {
        try {
          const before = await latest(slug);
          const status = await migrateOne(slug, pending);
          if (status.state === 'verified' && before?.state !== 'verified') {
            deps.log('info', 'project memory moved into the database', {
              project: slug,
              imported: status.imported,
              lenient: status.lenient,
              backup: status.backup_path,
            });
          } else if (status.state !== 'verified' && status.state !== 'not_needed') {
            deps.log('warn', 'project memory stays on its old repository', {
              project: slug,
              state: status.state,
              message: status.message,
            });
          }
        } catch (error) {
          deps.log('error', 'project memory migration failed', {
            project: slug,
            error: message(error),
          });
        }
      }
    },

    async migrate(slug) {
      const record = await latest(slug);
      const slugs = record?.state === 'verified' ? [] : [slug];

      return migrateOne(slug, slugs);
    },
  };
}
