/**
 * Pins concurrent and mismatched database openers.
 *
 * Why: the driver, the MCP server and the CLI can open one database file at nearly the
 *   same time. The applied set must be read only after taking the write lock, or two
 *   openers would both apply a migration; a database written by a newer binary must be
 *   refused rather than downgraded; and a failing migration must roll every pending one
 *   back so a half-migrated file is never left behind. Two openers are simulated
 *   in-process (a real second process cannot run the TypeScript sources with plain node).
 * Pins: the applied set is read under the write lock, a second opener may migrate between
 *   our read and write, unknown migrations are refused, and a failure rolls everything back.
 * Depends on: src/index.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ForgeError } from '@forge/core';
import { MIGRATIONS, openSqliteDriver, runMigrations } from '#/index.js';
import type { SqlDriver, SqlRow, SqlValue } from '#/index.js';

const dir = mkdtempSync(join(tmpdir(), 'forge-mig-'));
let n = 0;
const nextPath = () => join(dir, `m${n++}.sqlite`);
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('concurrent and mismatched openers', () => {
  it('reads the applied set only after taking the write lock', () => {
    const real = openSqliteDriver(':memory:');
    const log: string[] = [];
    const spy: SqlDriver = {
      ...real,
      exec: (sql) => {
        log.push(sql.trim().split(/\s+/).slice(0, 2).join(' '));
        real.exec(sql);
      },
      all: <T extends SqlRow = SqlRow>(sql: string, params?: readonly SqlValue[]) => {
        log.push(sql.trim().split(/\s+/).slice(0, 4).join(' '));

        return real.all<T>(sql, params);
      },
    };

    runMigrations(spy);
    real.close();
    const begin = log.indexOf('BEGIN IMMEDIATE');
    const readSelect = log.findIndex((l) => l.startsWith('SELECT id, checksum'));
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(readSelect).toBeGreaterThan(begin);
  });

  it('survives another opener migrating between our read and our write', () => {
    const path = nextPath();
    const a = openSqliteDriver(path, { busyTimeoutMs: 0 });
    const b = openSqliteDriver(path);
    let hooked = false;
    let aBlocked = false;
    const racing: SqlDriver = {
      ...b,
      all: <T extends SqlRow = SqlRow>(sql: string, params?: readonly SqlValue[]) => {
        const rows = b.all<T>(sql, params);
        if (!hooked && sql.includes('FROM schema_migrations')) {
          hooked = true;
          // Opener A tries to migrate right after B's read. With B holding the write
          // lock it is turned away; without the lock it would win and B's stale read
          // would make it re-create existing tables.
          try {
            runMigrations(a);
          } catch {
            aBlocked = true;
          }
        }

        return rows;
      },
    };

    const appliedByB = runMigrations(racing);
    const appliedByA = runMigrations(a);
    a.close();
    b.close();
    expect(hooked).toBe(true);
    expect(aBlocked).toBe(true);
    expect(appliedByB).toEqual(MIGRATIONS.map((m) => m.id));
    expect(appliedByA).toEqual([]);
  });

  it('lets two sequential openers on a fresh file both succeed, applying once', () => {
    const path = nextPath();
    const a = openSqliteDriver(path);
    const b = openSqliteDriver(path);
    const first = runMigrations(a);
    const second = runMigrations(b);
    const count = b.get<{ c: number }>('SELECT COUNT(*) AS c FROM schema_migrations');
    a.close();
    b.close();
    expect(first).toEqual(MIGRATIONS.map((m) => m.id));
    expect(second).toEqual([]);
    expect(count?.c).toBe(MIGRATIONS.length);
  });

  it('refuses a database that has migrations this binary does not know', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);
    driver.run(
      "INSERT INTO schema_migrations (id, name, checksum, applied_at) VALUES (99, 'future', 'x', 't')",
    );

    let failure: unknown;
    try {
      runMigrations(driver);
    } catch (e) {
      failure = e;
    }

    driver.close();
    expect(failure).toBeInstanceOf(ForgeError);
    expect(String((failure as Error).message)).toMatch(/newer|unknown migration/i);
    expect(String((failure as Error).message)).toContain('99');
  });

  it('applies nothing when the unknown-migration check fails', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver, MIGRATIONS.slice(0, 2));
    driver.run(
      "INSERT INTO schema_migrations (id, name, checksum, applied_at) VALUES (99, 'future', 'x', 't')",
    );

    expect(() => runMigrations(driver)).toThrow();
    const ids = driver
      .all<{ id: number }>('SELECT id FROM schema_migrations ORDER BY id')
      .map((r) => r.id);

    driver.close();
    expect(ids).toEqual([1, 2, 99]);
  });

  it('rolls back every pending migration when one of them fails (one transaction)', () => {
    const driver = openSqliteDriver(':memory:');
    expect(() =>
      runMigrations(driver, [
        { id: 1, name: 'ok', sql: 'CREATE TABLE t1 (x)' },
        { id: 2, name: 'bad', sql: 'CREATE TABLE (' },
      ]),
    ).toThrow();

    const tables = driver.all(
      "SELECT name FROM sqlite_master WHERE name IN ('t1', 'schema_migrations')",
    );

    driver.close();
    expect(tables).toEqual([]);
  });
});
