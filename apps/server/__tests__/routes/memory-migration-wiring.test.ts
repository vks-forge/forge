/**
 * Pins how the composed memory behaves around the move: which backend each project uses, and a crash in the middle.
 *
 * Why: the server composes one routed memory over two backends (the database and the old git repository) and
 *   decides per project, on every call, which one a project is on. The engine and the routes ask the same
 *   ports before, during and after the move, so what they see must be consistent at each point: a project not
 *   yet moved reads and writes its repository; the moment it is proven it reads and writes the database, with
 *   the same records. A crash after the import and before the delete leaves both, and the next start must
 *   prove the copy again and finish rather than import twice or delete without proof. A project with nothing to
 *   move never needs a backup.
 *
 * Pins: before the move the old whole-slice port and the index answer from the repository, after it from the
 *   database with the same records; a crash between import and delete is finished by the next start without a
 *   second backup or import; a project with no old repository gets no backup and no import record; a verified
 *   project is never touched again; a failed project is retried by the next start.
 * Depends on: helpers/memory-rig, @forge/memory, node:fs, vitest. IO: a SQLite file, temp folders, `git`.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createMemoryImporter } from '@forge/memory';
import { afterEach, describe, expect, it } from 'vitest';
import { oldRepo, startMemoryRig } from '#tests/helpers/memory-rig.js';
import type { MemoryRig } from '#tests/helpers/memory-rig.js';

let m: MemoryRig;
const decision = (n: number, statement: string): [string, string] => [
  `decisions/d-000${n}-x.md`,
  `---\nid: d-000${n}\nkind: decision\nstatement: ${statement}\nsource: { type: chat, ref: owner }\nauthor: user\norigin: owner\nstatus: active\nvalid_from: 2026-10-12\ntags: [t]\n---\nBody.\n`,
];

const rejected: [string, string] = [
  'rejected/r-0001-x.md',
  '---\nid: r-0001\nkind: rejected\nstatement: No vectors\nsource: { type: chat, ref: owner }\nauthor: user\norigin: owner\nstatus: active\nvalid_from: 2026-10-12\n---\nReason.\n',
];

const repo = (...pairs: [string, string][]) => Object.fromEntries(pairs);

afterEach(async () => {
  await m.close();
});

describe('around the move', () => {
  it('answers the slice port and the index from the repository before and from the database after, the same records', async () => {
    m = await startMemoryRig((h) => {
      oldRepo(
        h.memoryDir,
        'shop',
        repo(decision(1, 'Use zod'), decision(2, 'Ship Fridays'), rejected),
      );
    });

    await m.addProject('shop');
    const before = await m.parts.source.slice('shop');
    expect(before.decisions.map((r) => r.id)).toEqual(['d-0001', 'd-0002']);
    expect(before.rejected.map((r) => r.id)).toEqual(['r-0001']);
    expect((await m.parts.index.rejected('shop')).map((r) => r.id)).toEqual(['r-0001']);

    await m.parts.migration.migrateAll(['shop']);

    const after = await m.parts.source.slice('shop');
    expect(after.decisions.map((r) => r.id).sort()).toEqual(['d-0001', 'd-0002']);
    expect(after.rejected.map((r) => r.id)).toEqual(['r-0001']);
    expect(after.decisions.map((r) => r.statement).sort()).toEqual(
      before.decisions.map((r) => r.statement).sort(),
    );

    expect((await m.parts.index.digest('shop')).pinned).toBe(0);
    expect(
      (
        await m.parts.index.search({ project: 'shop', actor: 'director', text: 'zod' })
      ).hits.map((h) => h.id),
    ).toEqual(['d-0001']);

    // The agent slice still narrows after the move.
    const tagged = await m.parts.source.slice('shop', {
      tags: ['nope'],
      include_rejected: false,
    });

    expect(tagged).toEqual({ decisions: [], rejected: [] });
  }, 120_000);

  it('finishes a crash between import and delete at the next start: proves again, deletes, no second backup or import', async () => {
    let dir = '';
    m = await startMemoryRig((h) => {
      dir = oldRepo(h.memoryDir, 'shop', repo(decision(1, 'Use zod')));
    });

    await m.addProject('shop');
    // The first start died after the import: the importer ran, the repository is still there.
    const importer = createMemoryImporter({
      storage: m.storage,
      rootDir: m.dataHome.memoryDir,
      now: () => new Date(),
    });

    expect((await importer.import('shop', '/earlier/backup')).state).toBe('verified');
    expect(existsSync(dir)).toBe(true);
    expect(await m.parts.admin.backend('shop')).toBe('db');

    await m.parts.migration.migrateAll(['shop']);

    const record = await m.storage.transaction((tx) => tx.memory.importState('shop'));
    expect(existsSync(dir)).toBe(false);
    expect(record).toMatchObject({
      attempt: 1,
      state: 'verified',
      backup_path: '/earlier/backup',
    });

    expect(record?.repo_deleted_at).toEqual(expect.any(String));
    expect(existsSync(m.dataHome.backupsDir)).toBe(false);
  }, 120_000);

  it('needs no backup and leaves no import record for a project that never had an old repository', async () => {
    m = await startMemoryRig();
    await m.addProject('shop');
    await m.parts.migration.migrateAll(['shop']);

    expect(existsSync(m.dataHome.backupsDir)).toBe(false);
    expect(await m.storage.transaction((tx) => tx.memory.importState('shop'))).toBeNull();
    expect(await m.parts.admin.backend('shop')).toBe('db');
  });

  it('takes one backup for several projects and touches a verified project no more', async () => {
    m = await startMemoryRig((h) => {
      oldRepo(h.memoryDir, 'alpha', repo(decision(1, 'Alpha rule')));
      oldRepo(h.memoryDir, 'beta', repo(decision(1, 'Beta rule')));
    });

    await m.addProject('alpha');
    await m.addProject('beta');
    await m.parts.migration.migrateAll(['alpha', 'beta']);
    const backups = readdirSync(m.dataHome.backupsDir);

    expect(backups).toHaveLength(1);
    const first = await m.storage.transaction((tx) => tx.memory.importState('alpha'));
    expect(first?.backup_path).toBe(join(m.dataHome.backupsDir, backups[0] ?? ''));

    m.tick(5000);
    await m.parts.migration.migrateAll(['alpha', 'beta']);

    expect(readdirSync(m.dataHome.backupsDir)).toEqual(backups);
    expect(await m.storage.transaction((tx) => tx.memory.importState('alpha'))).toEqual(
      first,
    );

    expect(m.logs.filter((l) => l.includes('moved into the database'))).toHaveLength(2);
  }, 180_000);

  it('retries a project that stayed on its repository at the next start, and keeps logging why', async () => {
    let dir = '';
    m = await startMemoryRig((h) => {
      dir = oldRepo(h.memoryDir, 'shop', {
        ...repo(decision(1, 'Use zod')),
        'decisions/broken.md': 'nope\n',
      });
    });

    await m.addProject('shop');
    await m.parts.migration.migrateAll(['shop']);
    await m.parts.migration.migrateAll(['shop']);

    const record = await m.storage.transaction((tx) => tx.memory.importState('shop'));

    expect(record).toMatchObject({ attempt: 2, state: 'needs_attention' });
    expect(existsSync(join(dir, '.git'))).toBe(true);
    expect(m.logs.filter((l) => l.startsWith('warn project memory stays')).length).toBe(
      2,
    );
  }, 180_000);
});
