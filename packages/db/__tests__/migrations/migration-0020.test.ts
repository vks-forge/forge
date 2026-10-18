/**
 * Pins that a project row keeps its repository top and subfolder across a save and a read.
 *
 * Why: a project scoped to a subfolder (d-0124) is served from `repo_root` with the Worker
 *   confined to `subfolder`. If either value were dropped on the way through storage the
 *   project would silently restart from the wrong folder after a server restart, and tickets
 *   would be cut from, and merged into, the wrong tree. Older rows have neither and must
 *   keep reading as plain whole-repository projects.
 *
 * Pins: 0020 adds both columns; upsert/get round-trip them; absent values read as absent.
 * Depends on: src/index, vitest. IO: in-memory SQLite.
 */

import { describe, expect, it } from 'vitest';
import {
  MIGRATIONS,
  createStorageOnDriver,
  openSqliteDriver,
  runMigrations,
} from '#/index.js';

const base = {
  id: 'sf',
  slug: 'sf',
  prefix: 'SF',
  status: 'ready' as const,
  ecosystems: [],
  harness_defaults: {},
  tier_c_globs: [],
};

describe('0020 project scope', () => {
  it('round-trips repo_root and subfolder and leaves old rows unscoped', async () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(
      driver,
      MIGRATIONS.filter((m) => m.id < 20),
    );

    driver.run(`INSERT INTO projects (id, slug, prefix, harness_defaults_json, tier_c_globs_json)
      VALUES ('old', 'old', 'OLD', '{}', '[]')`);

    expect(runMigrations(driver)).toEqual([20, 21, 22, 23, 24, 25, 26, 27, 28]);
    const storage = createStorageOnDriver(driver);

    await storage.transaction((tx) =>
      tx.projects.upsert({
        ...base,
        local_path: 'C:/repo/pkg',
        repo_root: 'C:/repo',
        subfolder: 'pkg',
      }),
    );

    const scoped = await storage.transaction((tx) => tx.projects.get('sf'));
    const old = await storage.transaction((tx) => tx.projects.get('old'));
    await storage.close();

    expect(scoped).toMatchObject({ repo_root: 'C:/repo', subfolder: 'pkg' });
    expect(old?.repo_root).toBeUndefined();
    expect(old?.subfolder).toBeUndefined();
  });
});
