/**
 * Pins checkSchemaCurrent(): the read-only schema status check.
 *
 * Why: startup and diagnostics need to know whether a database is current, behind,
 *   ahead or edited without migrating it. A check that mutated the file, or called an
 *   edited migration "current", would hide a diverged schema until a query failed.
 * Pins: checkSchemaCurrent() reports current / behind / ahead / edited and creates nothing.
 * Depends on: src/index.
 */

import { describe, expect, it } from 'vitest';
import {
  MIGRATIONS,
  checkSchemaCurrent,
  openSqliteDriver,
  runMigrations,
} from '#/index.js';

describe('checkSchemaCurrent', () => {
  it('reports behind on a fresh database and creates nothing', () => {
    const driver = openSqliteDriver(':memory:');
    const report = checkSchemaCurrent(driver);
    const tables = driver.all("SELECT name FROM sqlite_master WHERE type = 'table'");
    driver.close();
    expect(report).toMatchObject({
      status: 'behind',
      pending: MIGRATIONS.map((m) => m.id),
      unknown: [],
    });

    expect(tables).toEqual([]);
  });

  it('reports behind when only some migrations are applied, then current', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver, MIGRATIONS.slice(0, 2));
    const behind = checkSchemaCurrent(driver);
    runMigrations(driver);
    const current = checkSchemaCurrent(driver);
    driver.close();
    expect(behind).toMatchObject({ status: 'behind', pending: [3, 4, 5, 6, 7, 8] });
    expect(current).toMatchObject({ status: 'current', pending: [], unknown: [] });
  });

  it('reports ahead when the database has newer migrations than the binary', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);
    driver.run(
      "INSERT INTO schema_migrations (id, name, checksum, applied_at) VALUES (99, 'future', 'x', 't')",
    );

    const report = checkSchemaCurrent(driver);
    driver.close();
    expect(report).toMatchObject({ status: 'ahead', unknown: [99] });
  });

  it('reports edited when an applied migration no longer matches its checksum', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);
    const first = MIGRATIONS[0];
    if (!first) {
      throw new Error('no migrations');
    }

    const report = checkSchemaCurrent(driver, [
      { ...first, sql: `${first.sql} -- x` },
      ...MIGRATIONS.slice(1),
    ]);

    driver.close();
    expect(report.status).toBe('edited');
    expect(report.edited).toEqual([first.id]);
  });
});
