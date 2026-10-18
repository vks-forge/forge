/**
 * The backup taken before memory moves into the database: a database snapshot and every project's memory folder.
 *
 * Why: moving a project's memory out of its git repository ends with deleting that repository, so a copy that
 *   can be restored must exist first and must be proven. This is the minimum of the planned backup system
 *   (d-0098), not the daily one: one folder `<backups>/pre-memory-db-<time>/` holding a consistent snapshot of
 *   the database (`VACUUM INTO` on a second connection, safe while the server's own is open), a copy of each
 *   project's memory folder, and a manifest of the size and sha256 of every file that is read back and checked
 *   before the path is returned. Secrets are never part of it (they live in their own folder, which is not
 *   copied). A backup that cannot be written or does not verify throws, and the migration then imports and
 *   deletes nothing for any project.
 *
 * Exports: backupBeforeMemoryMigration(), MemoryBackupError.
 * Depends on: node:fs/promises, node:path, node:crypto, @forge/core, @forge/db (openSqliteDriver).
 *   IO: reads the database and memory folders, writes under the backups folder.
 */

import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { CrashError } from '@forge/core';
import { openSqliteDriver } from '@forge/db';
import type { BackupDeps, BackupManifest } from '#/types/memory-backup.types.js';

/** The backup could not be written or did not match what it should hold. */
export class MemoryBackupError extends CrashError {}

const SQLITE_MAGIC = 'SQLite format 3\u0000';

async function filesUnder(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await filesUnder(path)));
    } else if (e.name !== 'manifest.json') {
      out.push(path);
    }
  }

  return out.sort();
}

const digest = async (path: string): Promise<{ size: number; sha256: string }> => {
  const bytes = await readFile(path);

  return { size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
};

/** Writes and verifies the backup; returns its folder. */
export async function backupBeforeMemoryMigration(deps: BackupDeps): Promise<string> {
  const stamp = deps.now().toISOString().replace(/[:.]/g, '-');
  const dir = join(deps.backupsDir, `pre-memory-db-${stamp}`);

  try {
    await mkdir(dir, { recursive: true });

    const snapshot = join(dir, 'forge.sqlite');
    const driver = openSqliteDriver(deps.dbPath);
    try {
      driver.run('VACUUM INTO ?', [snapshot]);
    } finally {
      driver.close();
    }

    for (const slug of deps.slugs) {
      await cp(join(deps.memoryDir, slug), join(dir, 'memory', slug), {
        recursive: true,
      });
    }

    const files: BackupManifest['files'] = [];
    for (const path of await filesUnder(dir)) {
      files.push({
        path: relative(dir, path).replace(/\\/g, '/'),
        ...(await digest(path)),
      });
    }

    const manifest: BackupManifest = {
      version: 1,
      created_at: deps.now().toISOString(),
      files,
    };

    await writeFile(
      join(dir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8',
    );

    await verifyBackup(dir);
  } catch (error) {
    throw error instanceof MemoryBackupError
      ? error
      : new MemoryBackupError(
          `memory backup failed: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
  }

  return dir;
}

/** Re-reads the manifest and every file it lists; throws on any difference, and checks the database copy is a database. */
export async function verifyBackup(dir: string): Promise<void> {
  const manifest = JSON.parse(
    await readFile(join(dir, 'manifest.json'), 'utf8'),
  ) as BackupManifest;

  for (const f of manifest.files) {
    const now = await digest(join(dir, ...f.path.split('/')));
    if (now.size !== f.size || now.sha256 !== f.sha256) {
      throw new MemoryBackupError(`backup file ${f.path} does not match its manifest`);
    }
  }

  const head = (await readFile(join(dir, 'forge.sqlite'))).subarray(
    0,
    SQLITE_MAGIC.length,
  );

  if (
    head.toString('latin1') !== SQLITE_MAGIC ||
    (await stat(join(dir, 'forge.sqlite'))).size < 4096
  ) {
    throw new MemoryBackupError('the database copy in the backup is not a database');
  }
}
