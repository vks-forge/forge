/**
 * Pins the harness registry table that migration 0012 adds.
 *
 * Why: the server reads this row at the start of every run to learn which `claude` to start
 *   and how it authenticates. If the table lost a column, seeded a row, or accepted an auth
 *   mode no driver implements, a run could start on the wrong binary or the wrong billing
 *   account, while a fresh install would still look fine.
 *
 * Pins: 0012 harnesses columns, no seed rows, the auth_mode CHECK.
 * Depends on: src/index.
 */

import { describe, expect, it } from 'vitest';
import { openSqliteDriver, runMigrations } from '#/index.js';

describe('0012 harnesses', () => {
  it('creates harnesses with its columns, seeds nothing and refuses an unknown auth mode', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);
    const cols = driver
      .all<{ name: string }>('PRAGMA table_info(harnesses)')
      .map((c) => c.name);

    const rows = driver.all('SELECT * FROM harnesses');
    const insert = (mode: string): void => {
      driver.run(
        "INSERT INTO harnesses (id, kind, auth_mode) VALUES ('x', 'claude', ?)",
        [mode],
      );
    };

    expect(() => insert('password')).toThrow();
    expect(() => insert('oauth_token')).not.toThrow();
    driver.close();
    expect(cols).toEqual([
      'id',
      'kind',
      'binary_path',
      'version',
      'auth_mode',
      'status',
      'last_checked_at',
    ]);

    expect(rows).toEqual([]);
  });
});
