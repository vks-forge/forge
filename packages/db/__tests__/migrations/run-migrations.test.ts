/**
 * Pins the migration runner: idempotent, checksummed, forward-only.
 *
 * Why: the database is opened on every start. If migrations were not idempotent a
 *   restart could fail or double-apply, and if an edited migration were accepted,
 *   installs would silently diverge in schema. Pinning checksum rejection, ordering and
 *   rollback of a failing migration protects every existing database from a bad schema
 *   change (director-core.md �3).
 *
 * Pins: runMigrations() applies once, is idempotent, applies only newer migrations, and
 *   rejects edited or out-of-order migrations. The per-migration table shapes, the
 *   concurrent openers and checkSchemaCurrent() have their own files.
 * Depends on: src/index.
 */

import { describe, expect, it } from 'vitest';
import { MIGRATIONS, openSqliteDriver, runMigrations } from '#/index.js';

const EXPECTED_TABLES = [
  'projects',
  'tickets',
  'ticket_relations',
  'intake_events',
  'wake_requests',
  'runs',
  'run_events',
  'run_inbox',
  'interactions',
  'gate_results',
  'tool_decisions',
  'tool_effects',
  'skills_registry',
  'skill_usage',
  'run_tokens',
  'schema_migrations',
];

describe('runMigrations', () => {
  it('creates every state and verification table and records each migration once', () => {
    const driver = openSqliteDriver(':memory:');
    const applied = runMigrations(driver);
    const tables = driver
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .map((r) => r.name);

    driver.close();
    expect(applied).toEqual(MIGRATIONS.map((m) => m.id));
    expect(tables).toEqual(expect.arrayContaining(EXPECTED_TABLES));
  });

  it('is idempotent: a second run applies nothing', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);
    const again = runMigrations(driver);
    driver.close();
    expect(again).toEqual([]);
  });

  it('applies only the newer migrations on an existing database', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver, MIGRATIONS.slice(0, 1));
    const applied = runMigrations(driver);
    driver.close();
    expect(applied).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });

  it('rejects a migration edited after it was applied', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);
    const first = MIGRATIONS[0];
    if (!first) {
      throw new Error('no migrations');
    }

    const edited = [{ ...first, sql: `${first.sql} -- edited` }, ...MIGRATIONS.slice(1)];
    expect(() => runMigrations(driver, edited)).toThrow(/edited after apply/);
    driver.close();
  });

  it('rejects non-increasing ids and rolls a failing migration back', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver, []);
    expect(() =>
      runMigrations(driver, [
        { id: 2, name: 'a', sql: 'SELECT 1' },
        { id: 1, name: 'b', sql: 'SELECT 1' },
      ]),
    ).toThrow(/must increase/);

    expect(() =>
      runMigrations(driver, [{ id: 3, name: 'bad', sql: 'CREATE TABLE x (' }]),
    ).toThrow();

    const rows = driver.all('SELECT id FROM schema_migrations WHERE id = 3');
    driver.close();
    expect(rows).toEqual([]);
  });
});
