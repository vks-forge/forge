/**
 * Pins that migration 0030 adds `tickets.conflict_count` without touching existing tickets.
 *
 * Why: the real database already holds tickets, and the merge-conflict cap (two automatic resolves,
 *   then a human) only protects the owner if the count starts at zero for every old ticket and
 *   survives a restart. The migration must keep each row as it was, add the column NOT NULL with
 *   default 0, and leave foreign keys clean.
 *
 * Pins: a seeded 0029 ticket survives unchanged and reads conflict_count 0, new tickets default to
 *   0, the column is NOT NULL, the count can be written, and foreign keys stay clean.
 * Depends on: src/index, vitest. IO: in-memory SQLite.
 */

import { describe, expect, it } from 'vitest';
import { MIGRATIONS, openSqliteDriver, runMigrations } from '#/index.js';

const STAMP = '2026-10-20T00:00:00.000Z';

const ticket = (id: string): string =>
  `INSERT INTO tickets (id, project, title, body, type, lane, tier_predicted, status,
     status_version, created_at, updated_at)
   VALUES ('${id}', 'sf', 't', 'b', 'feat', 'standard', 'A', 'in_progress', 0, '${STAMP}', '${STAMP}')`;

describe('0030 conflict-count', () => {
  it('keeps a seeded 0029 ticket unchanged and starts its count at 0', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(
      driver,
      MIGRATIONS.filter((m) => m.id <= 29),
    );

    driver.run(ticket('SF-1'));
    const before = driver.get<Record<string, unknown>>('SELECT * FROM tickets');

    runMigrations(driver);
    const after = driver.get<Record<string, unknown>>('SELECT * FROM tickets');

    expect(after).toEqual({ ...before, conflict_count: 0 });
    expect(driver.all('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('defaults a new ticket to 0, refuses NULL and stores a written count', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);
    driver.run(ticket('SF-2'));

    expect(
      driver.get<{ conflict_count: number }>(
        "SELECT conflict_count FROM tickets WHERE id = 'SF-2'",
      )?.conflict_count,
    ).toBe(0);

    expect(() =>
      driver.run("UPDATE tickets SET conflict_count = NULL WHERE id = 'SF-2'"),
    ).toThrow();

    driver.run("UPDATE tickets SET conflict_count = 2 WHERE id = 'SF-2'");
    expect(
      driver.get<{ conflict_count: number }>(
        "SELECT conflict_count FROM tickets WHERE id = 'SF-2'",
      )?.conflict_count,
    ).toBe(2);
  });
});
