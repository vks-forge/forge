/**
 * Memory import and export API tests: status, retry, backup, the old repository, markdown export, the access log.
 *
 * Why: moving a project's memory out of its git repository deletes that repository, so the owner must see
 *   what happened and be able to act: whether the project moved (and where the backup is), which files could
 *   not be read and why, a Retry that runs the whole move again, and a markdown export to review. A project that
 *   did not pass its proof must keep working from its old repository; a backup that cannot be written must stop
 *   the move for every project and leave every repository where it was; two imports of one project never run
 *   at once. The access log shows what searches asked of memory, so misses can be seen.
 *
 * Pins: not_needed, pending, verified (folder removed, backup with a manifest and a restorable database copy),
 *   needs_attention with the refused files listed while list and approve still work on the old repository, a
 *   Retry after the file is fixed, 409 `memory_import_running`, a failed backup for every project with nothing
 *   imported or deleted, export under `<dataHome>/exports/` (distinct each time, 409 while not migrated),
 *   and the access log with its limit.
 * Depends on: helpers/memory-rig, @forge/db, node:child_process, vitest. IO: a loopback socket, SQLite, temp folders, `git`.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openSqliteDriver } from '@forge/db';
import { afterEach, describe, expect, it } from 'vitest';
import { oldRepo, startMemoryRig } from '#tests/helpers/memory-rig.js';
import type { MemoryRig } from '#tests/helpers/memory-rig.js';

let m: MemoryRig;
const source = { type: 'chat', ref: 'owner' } as const;

const record = (n: number, statement: string): [string, string] => [
  `decisions/d-000${n}-x.md`,
  `---\nid: d-000${n}\nkind: decision\nstatement: ${statement}\nsource: { type: chat, ref: owner }\nauthor: user\norigin: owner\nstatus: active\nvalid_from: 2026-10-12\ntags: [t]\n---\nBody ${n}.\n`,
];

const files = (...pairs: [string, string][]): Record<string, string> =>
  Object.fromEntries(pairs);

const importPath = (slug: string): string => `/projects/${slug}/memory/import`;

afterEach(async () => {
  await m.close();
});

describe('import status and the move', () => {
  it('says not_needed for a project that never had an old repository', async () => {
    m = await startMemoryRig();
    await m.addProject('shop');

    const res = await m.rig.json('GET', importPath('shop'));

    expect(res).toMatchObject({
      status: 200,
      body: { state: 'not_needed', files: 0, rejects: [] },
    });
  });

  it('says pending until moved, then verified with the backup, and removes the old repository', async () => {
    m = await startMemoryRig((h) => {
      oldRepo(
        h.memoryDir,
        'shop',
        files(record(1, 'Use zod'), record(2, 'Ship on Fridays')),
      );
    });

    await m.addProject('shop');
    expect(await m.rig.json('GET', importPath('shop'))).toMatchObject({
      body: { state: 'pending' },
    });

    expect(await m.parts.admin.backend('shop')).toBe('files');

    const res = await m.rig.json('POST', importPath('shop'), {});
    const body = res.body as {
      state: string;
      files: number;
      imported: number;
      backup_path: string;
      repo_deleted_at: string;
    };

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ state: 'verified', files: 2, imported: 2 });
    expect(body.repo_deleted_at).toEqual(expect.any(String));
    expect(existsSync(join(m.dataHome.memoryDir, 'shop'))).toBe(false);
    expect(await m.parts.admin.backend('shop')).toBe('db');
    expect((await m.rig.json('GET', '/projects/shop/memory')).body).toMatchObject({
      records: [
        { id: 'd-0001', imported: true },
        { id: 'd-0002', imported: true },
      ],
    });

    // The backup holds a manifest, the project's repository and a database copy that opens.
    const manifest = JSON.parse(
      readFileSync(join(body.backup_path, 'manifest.json'), 'utf8'),
    ) as {
      files: { path: string; sha256: string }[];
    };

    expect(manifest.files.some((f) => f.path === 'forge.sqlite')).toBe(true);
    expect(manifest.files.some((f) => f.path.startsWith('memory/shop/'))).toBe(true);
    expect(manifest.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256))).toBe(true);
    expect(manifest.files.some((f) => f.path.includes('secrets'))).toBe(false);

    const copy = openSqliteDriver(join(body.backup_path, 'forge.sqlite'));
    expect(
      copy.get<{ n: number }>('SELECT COUNT(*) AS n FROM schema_migrations')?.n,
    ).toBeGreaterThan(20);

    copy.close();
  }, 120_000);

  it('keeps a project that did not pass its proof on its old repository, still readable and writable, and retries', async () => {
    let dir = '';
    m = await startMemoryRig((h) => {
      dir = oldRepo(h.memoryDir, 'shop', {
        ...files(record(1, 'Use zod')),
        'decisions/broken.md': 'no header at all\n',
      });
    });

    await m.addProject('shop');
    await m.parts.migration.migrateAll(['shop']);

    const status = (await m.rig.json('GET', importPath('shop'))).body as {
      state: string;
      rejects: { path: string; reason: string }[];
      message: string;
    };

    expect(status.state).toBe('needs_attention');
    expect(status.rejects).toEqual([
      { path: 'decisions/broken.md', reason: 'no front matter' },
    ]);

    expect(existsSync(dir)).toBe(true);
    expect(await m.parts.admin.backend('shop')).toBe('files');

    // Still served from the old repository: the list reads it, a proposal can be written and approved there.
    const list = (await m.rig.json('GET', '/projects/shop/memory')).body as {
      records: { id: string }[];
    };

    expect(list.records.map((r) => r.id)).toEqual(['d-0001']);
    await m.parts.memory.writer.propose('shop', { statement: 'Adopt pnpm', source });
    const approved = await m.rig.json(
      'POST',
      '/projects/shop/memory/proposals/x-0001/approve',
      { author: 'vikash' },
    );

    expect(approved.status).toBe(200);

    // The owner fixes the file; Retry moves everything, the approved proposal included.
    writeFileSync(join(dir, 'decisions', 'broken.md'), record(2, 'Fixed now')[1], 'utf8');
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '-A'], {
      cwd: dir,
      stdio: 'ignore',
    });

    execFileSync(
      'git',
      [
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@t',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '-m',
        'fix',
      ],
      {
        cwd: dir,
        stdio: 'ignore',
      },
    );

    const retry = await m.rig.json('POST', importPath('shop'), {});

    expect(retry).toMatchObject({
      status: 200,
      body: { state: 'verified', imported: 3, rejects: [] },
    });

    expect(existsSync(dir)).toBe(false);
  }, 180_000);

  it('answers 409 memory_import_running when the same project is imported twice at once', async () => {
    m = await startMemoryRig((h) => {
      oldRepo(h.memoryDir, 'shop', files(record(1, 'Use zod')));
    });

    await m.addProject('shop');
    const both = await Promise.all([
      m.rig.json('POST', importPath('shop'), {}),
      m.rig.json('POST', importPath('shop'), {}),
    ]);

    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(both.find((r) => r.status === 409)?.body).toMatchObject({
      error: { code: 'memory_import_running' },
    });
  }, 120_000);

  it('stops the move for every project when the backup cannot be written, and touches nothing', async () => {
    m = await startMemoryRig((h) => {
      oldRepo(h.memoryDir, 'alpha', files(record(1, 'Alpha rule')));
      oldRepo(h.memoryDir, 'beta', files(record(1, 'Beta rule')));
      // A file where the backups folder should be: nothing can be created under it.
      writeFileSync(h.backupsDir, 'not a folder', 'utf8');
    });

    await m.addProject('alpha');
    await m.addProject('beta');
    await m.parts.migration.migrateAll(['alpha', 'beta']);

    for (const slug of ['alpha', 'beta']) {
      const res = (await m.rig.json('GET', importPath(slug))).body as {
        state: string;
        message: string;
      };

      expect(res.state, slug).toBe('failed');
      expect(res.message).toContain('backup');
      expect(existsSync(join(m.dataHome.memoryDir, slug, '.git'))).toBe(true);
      expect(await m.storage.transaction((tx) => tx.memory.list(slug))).toEqual([]);
    }
  }, 120_000);
});

describe('export', () => {
  it('writes markdown under the exports folder, distinct even at the same instant, and refuses a project still on files', async () => {
    m = await startMemoryRig();
    await m.addProject('shop');
    await m.parts.memory.writer.decide('shop', { statement: 'Use zod', source });
    await m.parts.memory.writer.propose('shop', { statement: 'Pending idea', source });

    const first = await m.rig.json('POST', '/projects/shop/memory/export', {});
    const second = await m.rig.json('POST', '/projects/shop/memory/export', {});
    const a = first.body as { path: string; files: number; at: string };
    const b = second.body as { path: string };

    expect(first.status).toBe(200);
    expect(a.files).toBe(3);
    expect(a.path.startsWith(join(m.root, 'exports', 'memory-shop-'))).toBe(true);
    expect(a.path).not.toBe(b.path);
    expect(readdirSync(a.path).sort()).toEqual(['MEMORY.md', 'decisions', 'proposed']);
    expect(readFileSync(join(a.path, 'MEMORY.md'), 'utf8')).toContain('Use zod');

    expect((await m.rig.json('POST', '/projects/ghost/memory/export', {})).status).toBe(
      404,
    );
  });

  it('answers 409 memory_not_migrated for a project that has not moved', async () => {
    m = await startMemoryRig((h) => {
      oldRepo(h.memoryDir, 'shop', { 'decisions/broken.md': 'no header\n' });
    });

    await m.addProject('shop');
    await m.parts.migration.migrateAll(['shop']);

    expect(await m.rig.json('POST', '/projects/shop/memory/export', {})).toMatchObject({
      status: 409,
      body: { error: { code: 'memory_not_migrated' } },
    });
  }, 120_000);
});

describe('the access log', () => {
  it('lists what searches asked, newest first, bounded by limit', async () => {
    m = await startMemoryRig();
    await m.addProject('shop');
    await m.parts.memory.writer.decide('shop', { statement: 'Use zod', source });
    await m.rig.json('GET', '/projects/shop/memory/search?q=zod');
    await m.rig.json('GET', '/projects/shop/memory/search?q=quokka');

    const res = await m.rig.json('GET', '/projects/shop/memory/access-log?limit=1');
    const all = (await m.rig.json('GET', '/projects/shop/memory/access-log')).body as {
      rows: { actor: string; tool: string; query: string; total: number }[];
    };

    expect(res.body).toMatchObject({
      rows: [{ actor: 'web', tool: 'search', query: 'quokka', total: 0 }],
    });

    expect(all.rows.map((r) => r.query)).toEqual(['quokka', 'zod']);
    expect(
      (await m.rig.json('GET', '/projects/shop/memory/access-log?limit=0')).status,
    ).toBe(400);

    expect(
      (await m.rig.json('GET', '/projects/shop/memory/access-log?limit=201')).status,
    ).toBe(400);
  });
});
