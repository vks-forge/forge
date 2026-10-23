/**
 * Pins what migration 0013 changes: the harness table rebuild and the three new tables.
 *
 * Why: the rebuild of `harnesses` must keep every existing harness row, its order and its
 *   values (a user who set up a harness before this release must not have to do it again),
 *   while widening the status check so a failed compatibility check can pause it. The new
 *   tables hold the catalogue and the per-build tool approvals: if their keys or checks
 *   were wrong, two builds could share a row or a tool could carry a status nobody offers.
 *
 * Pins: 0013 keeps harness rows and order on upgrade from 0012, `paused` and `status_note`
 *   work, new table columns, status CHECKs, composite keys, no seed rows.
 * Depends on: src/index.
 */

import { describe, expect, it } from 'vitest';
import { MIGRATIONS, openSqliteDriver, runMigrations } from '#/index.js';

const columns = (driver: ReturnType<typeof openSqliteDriver>, table: string): string[] =>
  driver.all<{ name: string }>(`PRAGMA table_info(${table})`).map((c) => c.name);

describe('0013 catalogue-and-compat', () => {
  it('keeps harness rows and their order when upgrading a 0012 database', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(
      driver,
      MIGRATIONS.filter((m) => m.id <= 12),
    );

    driver.run(
      "INSERT INTO harnesses (id, kind, binary_path, version, auth_mode, status, last_checked_at) VALUES ('zeta', 'claude', 'C:/z/claude.exe', '2.1.299', 'api_key', 'ok', '2026-10-14T10:00:00.000Z')",
    );

    driver.run("INSERT INTO harnesses (id, kind) VALUES ('alpha', 'claude')");

    expect(runMigrations(driver).at(-1)).toBe(MIGRATIONS.at(-1)?.id);
    const rows = driver.all<Record<string, unknown>>(
      'SELECT * FROM harnesses ORDER BY rowid',
    );

    driver.close();
    expect(rows.map((r) => r['id'])).toEqual(['zeta', 'alpha']);
    expect(rows[0]).toMatchObject({
      binary_path: 'C:/z/claude.exe',
      version: '2.1.299',
      auth_mode: 'api_key',
      status: 'ok',
      status_note: null,
    });
  });

  it('lets a harness be paused with a note and still refuses an unknown status', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);

    const insert = (status: string): void => {
      driver.run(
        "INSERT INTO harnesses (id, kind, status, status_note) VALUES (?, 'claude', ?, 'why')",
        [`h-${status}`, status],
      );
    };

    expect(() => insert('paused')).not.toThrow();
    expect(() => insert('broken')).toThrow(/CHECK/);
    expect(columns(driver, 'harnesses')).toEqual([
      'id',
      'kind',
      'binary_path',
      'version',
      'auth_mode',
      'status',
      'last_checked_at',
      'status_note',
      'bypass_permissions',
    ]);

    driver.close();
  });

  it('creates the catalogue and compatibility tables, seeds nothing and checks statuses', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);

    expect(columns(driver, 'catalogue_versions')).toEqual([
      'version',
      'doc_json',
      'author',
      'reason',
      'created_at',
    ]);

    expect(columns(driver, 'harness_versions')).toEqual([
      'kind',
      'version',
      'compat',
      'report_json',
      'checked_at',
    ]);

    expect(columns(driver, 'harness_tool_schemas')).toEqual([
      'harness_kind',
      'version',
      'tool',
      'schema_hash',
      'status',
      'decided_by',
      'decided_at',
      'decision_reason',
    ]);

    for (const table of [
      'catalogue_versions',
      'harness_versions',
      'harness_tool_schemas',
    ]) {
      expect(driver.all(`SELECT * FROM ${table}`)).toEqual([]);
    }

    const tool = (status: string, version = '1'): void => {
      driver.run(
        "INSERT INTO harness_tool_schemas (harness_kind, version, tool, schema_hash, status) VALUES ('claude', ?, 'read', 'h', ?)",
        [version, status],
      );
    };

    expect(() => tool('maybe')).toThrow(/CHECK/);
    expect(() => tool('approved')).not.toThrow();
    expect(() => tool('pending')).toThrow(/UNIQUE|PRIMARY/);
    expect(() => tool('pending', '2')).not.toThrow();
    expect(() =>
      driver.run(
        "INSERT INTO harness_versions (kind, version, compat) VALUES ('claude', '1', 'maybe')",
      ),
    ).toThrow(/CHECK/);

    driver.close();
  });
});
