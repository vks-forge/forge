/**
 * Pins that migration 0032 adds the Director spend ledger and turns each card's old running total into
 * one dated row without touching anything else.
 *
 * Why: the real database holds cards whose Director spend lives only as a number inside their planning
 *   state. After the migration the Cost page and Overview read the ledger, so every dollar already
 *   recorded must appear there exactly once (one `backfill` row per card, equal to the old total and dated
 *   at the card's last update), cards that spent nothing must add no row, the old total must stay in place
 *   as the cached sum the budget check reads, and a second run of the migration SQL must add nothing.
 *
 * Pins: the table, its indexes and foreign keys exist; backfill yields one row per spending card equal
 *   to the old total; zero-spend and never-planned cards add none; the cached total is untouched; running
 *   the backfill again is a no-op; foreign keys stay clean.
 * Depends on: src/index, vitest. IO: in-memory SQLite.
 */

import { describe, expect, it } from 'vitest';
import { MIGRATIONS, openSqliteDriver, runMigrations } from '#/index.js';
import type { SqlDriver } from '#/index.js';

const STAMP = '2026-10-18T00:00:00.000Z';
const LATER = '2026-10-19T09:30:00.000Z';

const card = (driver: SqlDriver, id: string, grill: string, updated = STAMP): void => {
  driver.run(
    `INSERT INTO cards (id, project, type, title, summary, source_kind, source_ref,
       created_by_type, created_by_id, created_at, updated_at, phase, phase_version,
       needs_you, priority, grill_state_json)
     VALUES (?, 'sf', 'issue', 't', 's', 'chat', 'm', 'user', 'u', ?, ?, 'grilling', 0, 0, 'normal', ?)`,
    [id, STAMP, updated, grill],
  );
};

const before32 = (): SqlDriver => {
  const driver = openSqliteDriver(':memory:');
  runMigrations(
    driver,
    MIGRATIONS.filter((m) => m.id <= 31),
  );

  return driver;
};

describe('migration 0032: director spend ledger', () => {
  it('backfills one dated row per card from the old total and leaves the cache alone', () => {
    const driver = before32();
    card(driver, 'SF-C1', '{"director_spend_usd": 7.25}', LATER);
    card(driver, 'SF-C2', '{"director_spend_usd": 0}');
    card(driver, 'SF-C3', '{}');

    expect(runMigrations(driver)).toEqual([32]);

    const rows = driver.all(
      'SELECT project, card_id, ticket_id, kind, model, usd, recorded, at FROM director_spend',
    );

    expect(rows).toEqual([
      {
        project: 'sf',
        card_id: 'SF-C1',
        ticket_id: null,
        kind: 'backfill',
        model: null,
        usd: 7.25,
        recorded: 1,
        at: LATER,
      },
    ]);

    const cached = driver.get<{ grill_state_json: string }>(
      "SELECT grill_state_json FROM cards WHERE id = 'SF-C1'",
    );

    expect(JSON.parse(cached?.grill_state_json ?? '{}')).toEqual({
      director_spend_usd: 7.25,
    });

    expect(driver.all('PRAGMA foreign_key_check')).toEqual([]);
    driver.close();
  });

  it('adds nothing when the backfill statement runs a second time', () => {
    const driver = before32();
    card(driver, 'SF-C1', '{"director_spend_usd": 2}');
    runMigrations(driver);

    const migration = MIGRATIONS.find((m) => m.id === 32);
    const backfill = (migration?.sql ?? '').slice(
      (migration?.sql ?? '').indexOf('INSERT INTO director_spend'),
    );

    driver.exec(backfill);

    expect(driver.get<{ n: number }>('SELECT COUNT(*) AS n FROM director_spend')?.n).toBe(
      1,
    );

    driver.close();
  });

  it('creates the indexes, rejects a negative amount and enforces the card foreign key', () => {
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);

    const indexes = driver
      .all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'director_spend'",
      )
      .map((r) => r.name);

    expect(indexes).toEqual(
      expect.arrayContaining([
        'idx_director_spend_project_at',
        'idx_director_spend_card',
        'idx_director_spend_ticket',
      ]),
    );

    const insert = (card_id: string | null, usd: number) => () =>
      driver.run(
        `INSERT INTO director_spend (project, card_id, kind, usd, recorded, at)
         VALUES ('sf', ?, 'x', ?, 1, ?)`,
        [card_id, usd, STAMP],
      );

    expect(insert(null, -1)).toThrow();
    expect(insert('SF-C404', 1)).toThrow();
    expect(insert(null, 1)).not.toThrow();
    driver.close();
  });
});
