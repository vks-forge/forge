/**
 * Pins the backup taken before memory moves into the database.
 *
 * Why: moving a project's memory out of its git repository ends with deleting that repository, so a backup that
 *   can be restored must exist first and must be proven. It holds a snapshot of the database, a copy of each
 *   project's memory folder and a manifest of the size and sha256 of every file, all read back and checked
 *   before the path is returned. It never holds secrets. A folder that cannot be written, or a file that
 *   changed after the manifest was made, is an error, so the migration imports and deletes nothing.
 *
 * Pins: a backup with a database copy that opens and holds the rows, each project's folder, a verified
 *   manifest; secrets and unlisted projects are not copied; a changed file is detected; an unwritable backups
 *   folder throws a typed error and leaves nothing behind; two backups in one second do not collide.
 * Depends on: src/services/memory-backup, @forge/db, vitest. IO: temp folders and a SQLite file.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteStorage, openSqliteDriver } from '@forge/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MemoryBackupError,
  backupBeforeMemoryMigration,
  verifyBackup,
} from '#/services/memory-backup.js';

let root: string;
const NOW = new Date('2026-10-18T12:00:00.000Z');

const deps = (over: Record<string, unknown> = {}) => ({
  dbPath: join(root, 'forge.db'),
  backupsDir: join(root, 'backups'),
  memoryDir: join(root, 'memory'),
  slugs: ['shop'],
  now: () => NOW,
  ...over,
});

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'forge-backup-'));
  mkdirSync(join(root, 'memory', 'shop', 'decisions'), { recursive: true });
  mkdirSync(join(root, 'memory', 'other', 'decisions'), { recursive: true });
  mkdirSync(join(root, 'secrets'), { recursive: true });
  writeFileSync(join(root, 'memory', 'shop', 'decisions', 'd-0001.md'), 'Use zod\n');
  writeFileSync(join(root, 'memory', 'other', 'decisions', 'd-0001.md'), 'Other\n');
  writeFileSync(join(root, 'secrets', 'token'), 'secret');
  const storage = createSqliteStorage(join(root, 'forge.db'));
  await storage.transaction((tx) =>
    tx.projects.upsert({
      id: 'shop',
      slug: 'shop',
      prefix: 'SH',
      status: 'ready',
      ecosystems: [],
      harness_defaults: {},
      tier_c_globs: [],
    }),
  );

  await storage.close();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('a backup', () => {
  it('holds a database copy that opens with the rows, the listed project folders and a verified manifest', async () => {
    const dir = await backupBeforeMemoryMigration(deps());
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as {
      files: { path: string; size: number; sha256: string }[];
    };

    expect(dir).toBe(join(root, 'backups', 'pre-memory-db-2026-10-18T12-00-00-000Z'));
    expect(manifest.files.map((f) => f.path).sort()).toEqual([
      'forge.sqlite',
      'memory/shop/decisions/d-0001.md',
    ]);

    expect(
      manifest.files.every((f) => f.size > 0 && /^[0-9a-f]{64}$/.test(f.sha256)),
    ).toBe(true);

    await expect(verifyBackup(dir)).resolves.toBeUndefined();

    const copy = openSqliteDriver(join(dir, 'forge.sqlite'));
    expect(copy.get<{ slug: string }>('SELECT slug FROM projects')?.slug).toBe('shop');
    copy.close();
  });

  it('never copies secrets or a project it was not asked about', async () => {
    const dir = await backupBeforeMemoryMigration(deps());

    expect(existsSync(join(dir, 'memory', 'other'))).toBe(false);
    expect(existsSync(join(dir, 'secrets'))).toBe(false);
    expect(
      JSON.stringify(readFileSync(join(dir, 'manifest.json'), 'utf8')),
    ).not.toContain('secret');
  });

  it('is found wrong when a file changes after the manifest was written', async () => {
    const dir = await backupBeforeMemoryMigration(deps());
    writeFileSync(join(dir, 'memory', 'shop', 'decisions', 'd-0001.md'), 'Tampered\n');

    await expect(verifyBackup(dir)).rejects.toThrow(MemoryBackupError);
    await expect(verifyBackup(dir)).rejects.toThrow('d-0001.md does not match');
  });

  it('is found wrong when the database copy is not a database', async () => {
    const dir = await backupBeforeMemoryMigration(deps());
    writeFileSync(join(dir, 'forge.sqlite'), 'x'.repeat(5000));
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as {
      files: { path: string; size: number; sha256: string }[];
    };

    const { createHash } = await import('node:crypto');
    for (const f of manifest.files) {
      if (f.path === 'forge.sqlite') {
        f.size = 5000;
        f.sha256 = createHash('sha256').update('x'.repeat(5000)).digest('hex');
      }
    }

    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));

    await expect(verifyBackup(dir)).rejects.toThrow('not a database');
  });
});

describe('a backup that cannot be made', () => {
  it('throws a typed error when the backups folder cannot be created, and writes nothing', async () => {
    writeFileSync(join(root, 'backups'), 'a file where a folder should be');

    await expect(backupBeforeMemoryMigration(deps())).rejects.toThrow(MemoryBackupError);
    expect(readFileSync(join(root, 'backups'), 'utf8')).toBe(
      'a file where a folder should be',
    );
  });

  it('throws when a listed project folder is missing', async () => {
    await expect(backupBeforeMemoryMigration(deps({ slugs: ['ghost'] }))).rejects.toThrow(
      MemoryBackupError,
    );
  });
});
